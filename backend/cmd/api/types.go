package main

import (
	"database/sql"
	"net/http"
	"regexp"
	"time"

	"chiyo_analytics/backend/pkg/config"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type API struct {
	chConn clickhouse.Conn
	pgDB   *sql.DB
	rdb    *redis.Client
	cfg    *config.Config
}

var clickHouseTableNameRegex = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$`)

func (api *API) clickHouseEventsTable() string {
	table := api.cfg.ClickHouse.Table
	if !clickHouseTableNameRegex.MatchString(table) {
		panic("clickhouse.table must be a fully qualified table name like cyanly.events")
	}
	return table
}

// Structs for Recent Sessions
type RecentSession struct {
	SessionID       string          `json:"session_id"`
	VisitorID       string          `json:"visitor_id"`
	StartTime       time.Time       `json:"start_time"`
	EndTime         time.Time       `json:"end_time"`
	TotalDurationMs int32           `json:"total_duration_ms"`
	IP              string          `json:"ip"`
	Country         string          `json:"country"`
	CountryCode     string          `json:"country_code"`
	Region          string          `json:"region"`
	City            string          `json:"city"`
	Language        string          `json:"language"`
	UserAgent       string          `json:"user_agent"`
	DeviceType      string          `json:"device_type"`
	OSName          string          `json:"os_name"`
	OSVersion       string          `json:"os_version"`
	BrowserName     string          `json:"browser_name"`
	BrowserVersion  string          `json:"browser_version"`
	Referrer        string          `json:"referrer"`
	IsReturning     bool            `json:"is_returning"`
	DeviceBrand     string          `json:"device_brand"`
	DeviceModel     string          `json:"device_model"`
	ScreenWidth     int32           `json:"screen_width"`
	ScreenHeight    int32           `json:"screen_height"`
	Actions         []SessionAction `json:"actions"`
}

type SessionAction struct {
	URL        string    `json:"url"`
	Title      string    `json:"title"`
	Timestamp  time.Time `json:"timestamp"`
	DurationMs int32     `json:"duration_ms"`
}

type VisitorProfile struct {
	VisitorID        string    `json:"visitor_id"`
	TotalSessions    uint64    `json:"total_sessions"`
	FirstVisit       time.Time `json:"first_visit"`
	LastVisit        time.Time `json:"last_visit"`
	Devices          []string  `json:"devices"`
	OperatingSystems []string  `json:"operating_systems"`
	Browsers         []string  `json:"browsers"`
	Countries        []string  `json:"countries"`
}

// Helpers for request parsing
func parseTimeParams(c *gin.Context) (string, time.Time, time.Time, bool) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id parameter is required"})
		return "", time.Time{}, time.Time{}, false
	}

	startStr := c.Query("start")
	endStr := c.Query("end")

	var start, end time.Time
	var err error

	if startStr != "" {
		start, err = time.Parse(time.RFC3339, startStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid start time format (RFC3339 required)"})
			return "", time.Time{}, time.Time{}, false
		}
	} else {
		start = time.Now().Add(-24 * time.Hour)
	}

	if endStr != "" {
		end, err = time.Parse(time.RFC3339, endStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid end time format (RFC3339 required)"})
			return "", time.Time{}, time.Time{}, false
		}
	} else {
		end = time.Now()
	}

	return siteID, start.UTC(), end.UTC(), true
}
