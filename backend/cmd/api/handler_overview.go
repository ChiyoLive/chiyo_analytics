package main

import (
	"fmt"
	"log/slog"
	"math"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (api *API) GetOverview(c *gin.Context) {
	siteID, start, end, ok := parseTimeParams(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	query := fmt.Sprintf(`
		SELECT
			count() AS pv,
			uniq(visitor_id) AS uv,
			uniq(session_id) AS sessions,
			coalesce(avg(duration_ms), 0) AS avg_duration,
			(
				SELECT coalesce(countIf(pvs = 1) / if(count() = 0, 1, count()) * 100, 0)
				FROM (
					SELECT count() as pvs
					FROM %s
					WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview'
					GROUP BY session_id
				)
			) AS bounce_rate
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview'
	`, api.clickHouseEventsTable(), api.clickHouseEventsTable())

	var row struct {
		PV          uint64  `ch:"pv"`
		UV          uint64  `ch:"uv"`
		Sessions    uint64  `ch:"sessions"`
		AvgDuration float64 `ch:"avg_duration"`
		BounceRate  float64 `ch:"bounce_rate"`
	}

	if err := api.chConn.QueryRow(ctx, query, siteID, start, end, siteID, start, end).ScanStruct(&row); err != nil {
		slog.Error("ClickHouse query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}

	bounceRate := row.BounceRate
	if math.IsNaN(bounceRate) || math.IsInf(bounceRate, 0) {
		bounceRate = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"pageviews":        row.PV,
		"visitors":         row.UV,
		"sessions":         row.Sessions,
		"average_duration": int(row.AvgDuration),
		"bounce_rate":      bounceRate,
	})
}
