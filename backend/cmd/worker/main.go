package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"

	"chiyo_analytics/backend/pkg/config"
	"chiyo_analytics/backend/pkg/db"
	"chiyo_analytics/backend/pkg/health"
	"chiyo_analytics/backend/pkg/logger"
	"chiyo_analytics/backend/pkg/models"
	"chiyo_analytics/backend/pkg/parser"
	"chiyo_analytics/backend/pkg/privacy"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/redis/go-redis/v9"
)

type QueueMessage struct {
	Payload   models.SDKEvent `json:"payload"`
	IP        string          `json:"ip"`
	UserAgent string          `json:"user_agent"`
	Timestamp time.Time       `json:"timestamp"`
}

var clickHouseTableNameRegex = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$`)

func main() {
	configPath := flag.String("config", "../chiyo_analytics.toml", "Path to config file")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	logger.Setup(cfg.App)

	// Connect to Redis
	rdb, err := db.InitRedis(cfg.Redis)
	if err != nil {
		slog.Error("Failed to init Redis", "err", err)
		panic(err)
	}
	defer rdb.Close()

	// Connect to ClickHouse
	chConn, err := db.InitClickHouse(cfg.ClickHouse)
	if err != nil {
		slog.Error("Failed to init ClickHouse", "err", err)
		panic(err)
	}
	defer chConn.Close()

	// Init Parser
	pInstance := parser.NewParser(cfg.GeoIP)
	defer pInstance.Close()

	// Initialize Consumer Group
	err = rdb.XGroupCreateMkStream(context.Background(), cfg.Redis.Key, "cyanly-group", "$").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		slog.Error("Failed to create Redis Streams consumer group", "err", err)
		panic(err)
	}

	// Generate a unique consumer name
	hostname, err := os.Hostname()
	if err != nil {
		hostname = "unknown-host"
	}
	consumerName := fmt.Sprintf("worker-%s-%d", hostname, time.Now().UnixNano())

	slog.Info("Daemon started", "consumer", consumerName)

	healthListener, err := net.Listen("tcp", cfg.Worker.HealthAddr)
	if err != nil {
		slog.Error("Failed to bind worker health server", "addr", cfg.Worker.HealthAddr, "err", err)
		panic(fmt.Sprintf("Failed to bind worker health server: %v", err))
	}

	// Start a lightweight health check HTTP server
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/healthz", health.WorkerHealthz)
		mux.HandleFunc("/readyz", health.WorkerReadyz(rdb, chConn))

		slog.Info("Worker health check server listening", "addr", cfg.Worker.HealthAddr)
		if err := http.Serve(healthListener, mux); err != nil && err != http.ErrServerClosed {
			slog.Error("Worker health check server failed", "err", err)
		}
	}()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	buffer := make([]models.ClickHouseEvent, 0)
	streamIDs := make([]string, 0)
	maxBatchSize := 500
	flushInterval := 2 * time.Second
	lastFlush := time.Now()

	go func() {
		<-sigChan
		slog.Info("Shutting down... flushing remaining buffer")
		cancel()
	}()

	checkPending := true

	for {
		select {
		case <-ctx.Done():
			// Flush final batch before exiting
			if len(buffer) > 0 {
				if err := writeBatchToClickHouse(context.Background(), chConn, cfg.ClickHouse.Table, buffer); err != nil {
					slog.Error("Final flush error", "err", err)
				} else {
					slog.Info("Final flush of events succeeded", "count", len(buffer))
					if err := rdb.XAck(context.Background(), cfg.Redis.Key, "cyanly-group", streamIDs...).Err(); err != nil {
						slog.Error("Redis final XACK error", "err", err)
					}
				}
			}
			return
		default:
			var entries []redis.XMessage

			if checkPending {
				// Read pending messages first (ID "0")
				streams, err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
					Group:    "cyanly-group",
					Consumer: consumerName,
					Streams:  []string{cfg.Redis.Key, "0"},
					Count:    50,
					Block:    -1, // No blocking
				}).Result()

				if err != nil {
					if err != redis.Nil {
						slog.Error("Error reading pending messages", "err", err)
					}
					checkPending = false
				} else if len(streams) > 0 && len(streams[0].Messages) > 0 {
					entries = streams[0].Messages
					slog.Info("Recovering pending messages", "count", len(entries))
				} else {
					checkPending = false
				}
			}

			if !checkPending && len(entries) == 0 {
				// Read new messages (ID ">")
				streams, err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
					Group:    "cyanly-group",
					Consumer: consumerName,
					Streams:  []string{cfg.Redis.Key, ">"},
					Count:    50,
					Block:    1 * time.Second, // Block for 1s so select case can trigger on context cancellation
				}).Result()

				if err != nil {
					if err != redis.Nil && ctx.Err() == nil {
						slog.Error("Redis error", "err", err)
						time.Sleep(1 * time.Second)
					}
				} else if len(streams) > 0 && len(streams[0].Messages) > 0 {
					entries = streams[0].Messages
				}
			}

			for _, entry := range entries {
				payloadStr, ok := entry.Values["payload"].(string)
				if !ok {
					slog.Warn("Corrupted stream entry: missing payload", "msgID", entry.ID)
					rdb.XAck(ctx, cfg.Redis.Key, "cyanly-group", entry.ID)
					continue
				}

				var qMsg QueueMessage
				if err := json.Unmarshal([]byte(payloadStr), &qMsg); err != nil {
					slog.Error("JSON unmarshal error for Msg ID", "msgID", entry.ID, "err", err)

					// Push to Dead Letter Queue (DLQ)
					dlqMsg := map[string]interface{}{
						"message_id": entry.ID,
						"payload":    payloadStr,
						"error":      err.Error(),
						"failed_at":  time.Now().UTC().Format(time.RFC3339),
					}
					dlqData, _ := json.Marshal(dlqMsg)
					if dlqErr := rdb.LPush(ctx, "cyanly:dlq", dlqData).Err(); dlqErr != nil {
						slog.Error("Failed to push to DLQ", "err", dlqErr)
					}

					// ACK to remove from pending
					rdb.XAck(ctx, cfg.Redis.Key, "cyanly-group", entry.ID)
					continue
				}

				// Parse IP and UA
				parsed := pInstance.Parse(qMsg.IP, qMsg.UserAgent)

				// Determine if we need to anonymize/mask data based on location, consent and GPC/DNT privacy signals
				needAnonymize := shouldAnonymize(qMsg.Payload.Consent, parsed.CountryCode, qMsg.Payload.Gpc)

				visitorID := qMsg.Payload.VisitorID
				ipToWrite := qMsg.IP

				if needAnonymize {
					visitorID = generateDailyVisitorHash(qMsg.IP, qMsg.UserAgent, qMsg.Payload.SiteID, cfg.API.JWTSecret, qMsg.Timestamp)
					ipToWrite = maskIP(qMsg.IP)
				}

				// Create ClickHouse event
				chEvent := models.ClickHouseEvent{
					SiteID:         qMsg.Payload.SiteID,
					Timestamp:      qMsg.Timestamp,
					VisitorID:      visitorID,
					SessionID:      qMsg.Payload.SessionID,
					EventName:      qMsg.Payload.EventName,
					Properties:     qMsg.Payload.Properties,
					URL:            qMsg.Payload.URL,
					Title:          qMsg.Payload.Title,
					Referrer:       qMsg.Payload.Referrer,
					DurationMs:     qMsg.Payload.DurationMs,
					ScreenWidth:    qMsg.Payload.ScreenWidth,
					ScreenHeight:   qMsg.Payload.ScreenHeight,
					UTMSource:      qMsg.Payload.UTM.UTMSource,
					UTMMedium:      qMsg.Payload.UTM.UTMMedium,
					UTMCampaign:    qMsg.Payload.UTM.UTMCampaign,
					UTMTerm:        qMsg.Payload.UTM.UTMTerm,
					UTMContent:     qMsg.Payload.UTM.UTMContent,
					GCLID:          qMsg.Payload.UTM.GCLID,
					FBCLID:         qMsg.Payload.UTM.FBCLID,
					TTCLID:         qMsg.Payload.UTM.TTCLID,
					BLCLID:         qMsg.Payload.UTM.BLCLID,
					BDVID:          qMsg.Payload.UTM.BDVID,
					GDTVID:         qMsg.Payload.UTM.GDTVID,
					MSCLKID:        qMsg.Payload.UTM.MSCLKID,
					TWCLID:         qMsg.Payload.UTM.TWCLID,
					ClickID:        qMsg.Payload.UTM.ClickID,
					IP:             ipToWrite,
					Country:        parsed.Country,
					Region:         parsed.Region,
					City:           parsed.City,
					UserAgent:      qMsg.UserAgent,
					DeviceType:     parsed.DeviceType,
					OSName:         parsed.OSName,
					OSVersion:      parsed.OSVersion,
					BrowserName:    parsed.BrowserName,
					BrowserVersion: parsed.BrowserVersion,
					Language:       qMsg.Payload.Language,
					CountryCode:    parsed.CountryCode,
					DeviceBrand:    parsed.DeviceBrand,
					DeviceModel:    parsed.DeviceModel,
					IPASN:          parsed.IPASN,
					IPASNName:      parsed.IPASNName,
				}

				buffer = append(buffer, chEvent)
				streamIDs = append(streamIDs, entry.ID)
			}

			// Batch flush trigger
			if len(buffer) > 0 && (len(buffer) >= maxBatchSize || time.Since(lastFlush) >= flushInterval) {
				if err := writeBatchToClickHouse(ctx, chConn, cfg.ClickHouse.Table, buffer); err != nil {
					slog.Error("ClickHouse batch write error", "err", err)
				} else {
					slog.Info("Flushed events to ClickHouse", "count", len(buffer))
					if err := rdb.XAck(ctx, cfg.Redis.Key, "cyanly-group", streamIDs...).Err(); err != nil {
						slog.Error("Redis XACK error", "err", err)
					}
					buffer = make([]models.ClickHouseEvent, 0)
					streamIDs = make([]string, 0)
					lastFlush = time.Now()
				}
			}
		}
	}
}

func writeBatchToClickHouse(ctx context.Context, conn clickhouse.Conn, table string, events []models.ClickHouseEvent) error {
	if !clickHouseTableNameRegex.MatchString(table) {
		return fmt.Errorf("clickhouse.table must be a fully qualified table name like cyanly.events")
	}

	query := fmt.Sprintf(`
		INSERT INTO %s (
			site_id, timestamp, visitor_id, session_id, event_name, properties, url, title, referrer, duration_ms,
			screen_width, screen_height, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
			gclid, fbclid, ttclid, blclid, bd_vid, gdt_vid, msclkid, twclid, clickid,
			ip, country, region, city, user_agent, device_type, os_name, os_version, browser_name, browser_version,
			language, country_code, device_brand, device_model, ip_asn, ip_asn_name
		)
	`, table)
	batch, err := conn.PrepareBatch(ctx, query)
	if err != nil {
		return err
	}

	for _, ev := range events {
		err := batch.Append(
			ev.SiteID,
			ev.Timestamp,
			ev.VisitorID,
			ev.SessionID,
			ev.EventName,
			ev.Properties,
			ev.URL,
			ev.Title,
			ev.Referrer,
			ev.DurationMs,
			ev.ScreenWidth,
			ev.ScreenHeight,
			ev.UTMSource,
			ev.UTMMedium,
			ev.UTMCampaign,
			ev.UTMTerm,
			ev.UTMContent,
			ev.GCLID,
			ev.FBCLID,
			ev.TTCLID,
			ev.BLCLID,
			ev.BDVID,
			ev.GDTVID,
			ev.MSCLKID,
			ev.TWCLID,
			ev.ClickID,
			ev.IP,
			ev.Country,
			ev.Region,
			ev.City,
			ev.UserAgent,
			ev.DeviceType,
			ev.OSName,
			ev.OSVersion,
			ev.BrowserName,
			ev.BrowserVersion,
			ev.Language,
			ev.CountryCode,
			ev.DeviceBrand,
			ev.DeviceModel,
			ev.IPASN,
			ev.IPASNName,
		)
		if err != nil {
			return err
		}
	}

	return batch.Send()
}

func maskIP(ipStr string) string {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return ipStr
	}
	if ip.To4() != nil {
		mask := net.CIDRMask(24, 32)
		return ip.Mask(mask).String()
	}
	mask := net.CIDRMask(48, 128)
	return ip.Mask(mask).String()
}

func generateDailyVisitorHash(ip, ua, siteID, secret string, timestamp time.Time) string {
	dateStr := timestamp.Format("2006-01-02")
	saltData := fmt.Sprintf("%s:%s", secret, dateStr)
	saltHash := sha256.Sum256([]byte(saltData))
	saltHex := hex.EncodeToString(saltHash[:])

	visitorData := fmt.Sprintf("%s:%s:%s:%s", ip, ua, siteID, saltHex)
	visitorHash := sha256.Sum256([]byte(visitorData))
	return hex.EncodeToString(visitorHash[:])
}

func shouldAnonymize(consent *string, countryCode string, isGpcOrDnt bool) bool {
	normalizedCountryCode := strings.ToUpper(countryCode)

	if consent != nil {
		consentStr := *consent
		if consentStr == "denied" {
			return true
		} else if consentStr == "granted" {
			return false
		} else if strings.HasPrefix(consentStr, "{") {
			var settings struct {
				Required        bool `json:"required"`
				Functional      bool `json:"functional"`
				Personalization bool `json:"personalization"`
			}
			if err := json.Unmarshal([]byte(consentStr), &settings); err == nil {
				// If personalization is not allowed, anonymize
				return !settings.Personalization
			}
			// Fallback to anonymize on parse error
			return true
		}
		// Any other unknown state defaults to anonymize
		return true
	}

	// Fallback to region-specific rules and GPC/DNT privacy signals
	if privacy.RequiresDefaultAnonymization(normalizedCountryCode) || normalizedCountryCode == "CN" {
		return true
	} else if normalizedCountryCode == "US" {
		return isGpcOrDnt
	} else {
		// JP / RoW
		return isGpcOrDnt
	}
}
