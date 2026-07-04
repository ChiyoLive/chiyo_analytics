package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (api *API) GetRecentSessions(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}

	ctx := c.Request.Context()

	// 1. Get 50 most recent sessions in the last 24 hours
	recentLimit := time.Now().Add(-24 * time.Hour)
	querySessions := fmt.Sprintf(`
		SELECT session_id, max(timestamp) AS last_active
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND event_name = 'pageview'
		GROUP BY session_id
		ORDER BY last_active DESC
		LIMIT 50
	`, api.clickHouseEventsTable())
	rows, err := api.chConn.Query(ctx, querySessions, siteID, recentLimit)
	if err != nil {
		slog.Error("GetRecentSessions query sessions error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer rows.Close()

	var sessionIDs []string
	for rows.Next() {
		var sID string
		var t time.Time
		if err := rows.Scan(&sID, &t); err != nil {
			continue
		}
		sessionIDs = append(sessionIDs, sID)
	}

	if len(sessionIDs) == 0 {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	// 2. Fetch all events for these sessions
	queryEvents := fmt.Sprintf(`
		SELECT
			session_id, visitor_id, timestamp, url, title, referrer, duration_ms,
			ip, country, country_code, region, city, language,
			user_agent, device_type, os_name, os_version, browser_name, browser_version,
			device_brand, device_model, screen_width, screen_height
		FROM %s
		WHERE site_id = ? AND session_id IN (?) AND event_name = 'pageview'
		ORDER BY timestamp ASC
	`, api.clickHouseEventsTable())
	rowsEvents, err := api.chConn.Query(ctx, queryEvents, siteID, sessionIDs)
	if err != nil {
		slog.Error("GetRecentSessions query events error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer rowsEvents.Close()

	type Event struct {
		SessionID      string
		VisitorID      string
		Timestamp      time.Time
		URL            string
		Title          string
		Referrer       string
		DurationMs     int32
		IP             string
		Country        string
		CountryCode    string
		Region         string
		City           string
		Language       string
		UserAgent      string
		DeviceType     string
		OSName         string
		OSVersion      string
		BrowserName    string
		BrowserVersion string
		DeviceBrand    string
		DeviceModel    string
		ScreenWidth    int32
		ScreenHeight   int32
	}

	var events []Event
	visitorIDsMap := make(map[string]bool)

	for rowsEvents.Next() {
		var ev Event
		err := rowsEvents.Scan(
			&ev.SessionID, &ev.VisitorID, &ev.Timestamp, &ev.URL, &ev.Title, &ev.Referrer, &ev.DurationMs,
			&ev.IP, &ev.Country, &ev.CountryCode, &ev.Region, &ev.City, &ev.Language,
			&ev.UserAgent, &ev.DeviceType, &ev.OSName, &ev.OSVersion, &ev.BrowserName, &ev.BrowserVersion,
			&ev.DeviceBrand, &ev.DeviceModel, &ev.ScreenWidth, &ev.ScreenHeight,
		)
		if err != nil {
			slog.Error("Scan event error", "err", err)
			continue
		}
		events = append(events, ev)
		visitorIDsMap[ev.VisitorID] = true
	}

	// 3. Fetch first visit time for these visitors
	var visitorIDs []string
	for vid := range visitorIDsMap {
		visitorIDs = append(visitorIDs, vid)
	}

	firstVisitMap := make(map[string]time.Time)
	if len(visitorIDs) > 0 {
		queryFirstVisits := fmt.Sprintf(`
			SELECT visitor_id, min(timestamp) AS first_visit
			FROM %s
			WHERE site_id = ? AND visitor_id IN (?) AND event_name = 'pageview'
			GROUP BY visitor_id
		`, api.clickHouseEventsTable())
		rowsFirst, err := api.chConn.Query(ctx, queryFirstVisits, siteID, visitorIDs)
		if err != nil {
			slog.Error("Query first visits error", "err", err)
		} else {
			defer rowsFirst.Close()
			for rowsFirst.Next() {
				var vid string
				var fv time.Time
				if err := rowsFirst.Scan(&vid, &fv); err == nil {
					firstVisitMap[vid] = fv
				}
			}
		}
	}

	// 4. Group events into RecentSessions in the order of sessionIDs (most recent first)
	sessionsMap := make(map[string]*RecentSession)
	for _, sID := range sessionIDs {
		sessionsMap[sID] = &RecentSession{
			SessionID: sID,
			Actions:   []SessionAction{},
		}
	}

	for _, ev := range events {
		s, exists := sessionsMap[ev.SessionID]
		if !exists {
			continue
		}

		if s.VisitorID == "" {
			s.VisitorID = ev.VisitorID
			s.IP = ev.IP
			s.Country = ev.Country
			s.CountryCode = ev.CountryCode
			s.Region = ev.Region
			s.City = ev.City
			s.Language = ev.Language
			s.UserAgent = ev.UserAgent
			s.DeviceType = ev.DeviceType
			s.OSName = ev.OSName
			s.OSVersion = ev.OSVersion
			s.BrowserName = ev.BrowserName
			s.BrowserVersion = ev.BrowserVersion
			s.Referrer = ev.Referrer
			s.DeviceBrand = ev.DeviceBrand
			s.DeviceModel = ev.DeviceModel
			s.ScreenWidth = ev.ScreenWidth
			s.ScreenHeight = ev.ScreenHeight
		}

		s.Actions = append(s.Actions, SessionAction{
			URL:        ev.URL,
			Title:      ev.Title,
			Timestamp:  ev.Timestamp,
			DurationMs: ev.DurationMs,
		})

		s.TotalDurationMs += ev.DurationMs
	}

	var result []RecentSession = make([]RecentSession, 0)
	for _, sID := range sessionIDs {
		s := sessionsMap[sID]
		if len(s.Actions) == 0 {
			continue
		}

		s.StartTime = s.Actions[0].Timestamp
		s.EndTime = s.Actions[len(s.Actions)-1].Timestamp

		if fv, ok := firstVisitMap[s.VisitorID]; ok {
			s.IsReturning = s.StartTime.Sub(fv) > 5*time.Second
		}

		result = append(result, *s)
	}

	c.JSON(http.StatusOK, result)
}
