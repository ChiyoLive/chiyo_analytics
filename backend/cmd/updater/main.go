package main

import (
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"chiyo_analytics/backend/pkg/config"
	"chiyo_analytics/backend/pkg/logger"

	"github.com/oschwald/maxminddb-golang"
	"github.com/robfig/cron/v3"
)

func main() {
	configPath := flag.String("config", "../chiyo_analytics.toml", "Path to config file")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	logger.Setup(cfg.App)

	slog.Info("Updater daemon starting...")

	scheduler := cron.New(cron.WithLocation(time.UTC))

	registerJob := func(item *config.GeoIPUpdaterItem, targetPath string, label string) {
		if item == nil || item.URL == "" || item.Cron == "" || targetPath == "" {
			slog.Debug("Skipping unconfigured updater item", "label", label)
			return
		}

		slog.Info("Scheduling update job", "label", label, "cron", item.Cron, "url", item.URL, "target", targetPath)

		_, err := scheduler.AddFunc(item.Cron, func() {
			if err := downloadAndReplace(targetPath, item.URL, label); err != nil {
				slog.Error("Failed to update database in cron job", "label", label, "err", err)
			}
		})
		if err != nil {
			slog.Error("Failed to add job to scheduler", "label", label, "cron", item.Cron, "err", err)
			panic(err)
		}
	}

	registerJob(cfg.Updater.GeoIP.DBIPv4, cfg.GeoIP.DBIPv4, "update_db_ipv4")
	registerJob(cfg.Updater.GeoIP.DBIPv6, cfg.GeoIP.DBIPv6, "update_db_ipv6")
	registerJob(cfg.Updater.GeoIP.DBASN, cfg.GeoIP.DBASN, "update_db_asn")

	scheduler.Start()
	slog.Info("Scheduler started successfully")

	// Handle Graceful Shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	slog.Info("Stopping scheduler and shutting down...")
	scheduler.Stop()
	slog.Info("Updater daemon stopped cleanly")
}

func downloadAndReplace(targetPath string, url string, label string) error {
	slog.Info("Starting update", "label", label, "url", url, "target", targetPath)

	// Ensure the parent directory exists
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directories for %s: %w", targetPath, err)
	}

	// Create request
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create http request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("http GET request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected http status code: %d", resp.StatusCode)
	}

	// Write to temporary file
	tmpPath := targetPath + ".tmp"
	tmpFile, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}

	cleanupTmp := true
	defer func() {
		tmpFile.Close()
		if cleanupTmp {
			if _, err := os.Stat(tmpPath); err == nil {
				os.Remove(tmpPath)
			}
		}
	}()

	_, err = io.Copy(tmpFile, resp.Body)
	if err != nil {
		return fmt.Errorf("failed to write temporary file: %w", err)
	}
	tmpFile.Close() // Close early to allow renaming / validation

	// Validate MMDB file
	db, err := maxminddb.Open(tmpPath)
	if err != nil {
		return fmt.Errorf("downloaded file is not a valid maxmind database: %w", err)
	}
	db.Close()

	// Atomically replace the original file
	err = os.Rename(tmpPath, targetPath)
	if err != nil {
		return fmt.Errorf("failed to replace active database file: %w", err)
	}

	cleanupTmp = false
	slog.Info("Successfully updated database", "label", label, "target", targetPath)
	return nil
}
