package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (api *API) GetVisitorProfile(c *gin.Context) {
	siteID := c.Query("site_id")
	visitorID := c.Query("visitor_id")

	if siteID == "" || visitorID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id and visitor_id are required"})
		return
	}

	ctx := c.Request.Context()

	query := fmt.Sprintf(`
		SELECT
			count(distinct session_id) AS total_sessions,
			min(timestamp) AS first_visit,
			max(timestamp) AS last_visit,
			groupUniqArray(device_type) AS devices,
			groupUniqArray(os_name) AS operating_systems,
			groupUniqArray(browser_name) AS browsers,
			groupUniqArray(country) AS countries
		FROM %s
		WHERE site_id = ? AND visitor_id = ? AND event_name = 'pageview'
	`, api.clickHouseEventsTable())

	var row struct {
		TotalSessions    uint64    `ch:"total_sessions"`
		FirstVisit       time.Time `ch:"first_visit"`
		LastVisit        time.Time `ch:"last_visit"`
		Devices          []string  `ch:"devices"`
		OperatingSystems []string  `ch:"operating_systems"`
		Browsers         []string  `ch:"browsers"`
		Countries        []string  `ch:"countries"`
	}

	if err := api.chConn.QueryRow(ctx, query, siteID, visitorID).ScanStruct(&row); err != nil {
		slog.Error("GetVisitorProfile query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	c.JSON(http.StatusOK, VisitorProfile{
		VisitorID:        visitorID,
		TotalSessions:    row.TotalSessions,
		FirstVisit:       row.FirstVisit,
		LastVisit:        row.LastVisit,
		Devices:          row.Devices,
		OperatingSystems: row.OperatingSystems,
		Browsers:         row.Browsers,
		Countries:        row.Countries,
	})
}
