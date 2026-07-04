package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (api *API) GetTimeSeries(c *gin.Context) {
	siteID, start, end, ok := parseTimeParams(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	// Decide bucket granularity based on timerange
	bucketFunc := "toStartOfHour"
	timeFormat := "2006-01-02 15:00:00"
	if end.Sub(start) > 72*time.Hour {
		bucketFunc = "toStartOfDay"
		timeFormat = "2006-01-02"
	}

	query := fmt.Sprintf(`
		SELECT
			%s(timestamp) AS bucket,
			count() AS pv,
			uniq(visitor_id) AS uv
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview'
		GROUP BY bucket
		ORDER BY bucket ASC
	`, bucketFunc, api.clickHouseEventsTable())

	rows, err := api.chConn.Query(ctx, query, siteID, start, end)
	if err != nil {
		slog.Error("Time series query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer rows.Close()

	type TimeSeriesItem struct {
		Bucket string `json:"timestamp"`
		PV     uint64 `json:"pageviews"`
		UV     uint64 `json:"visitors"`
	}

	series := make([]TimeSeriesItem, 0)
	for rows.Next() {
		var bucket time.Time
		var pv, uv uint64
		if err := rows.Scan(&bucket, &pv, &uv); err != nil {
			slog.Error("Time series scan error", "err", err)
			continue
		}
		series = append(series, TimeSeriesItem{
			Bucket: bucket.Format(timeFormat),
			PV:     pv,
			UV:     uv,
		})
	}

	c.JSON(http.StatusOK, series)
}
