package main

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (api *API) GetPages(c *gin.Context) {
	siteID, start, end, ok := parseTimeParams(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	query := fmt.Sprintf(`
		SELECT
			url,
			any(title) AS title,
			count() AS pv,
			uniq(visitor_id) AS uv,
			coalesce(avg(duration_ms), 0) AS avg_duration
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview'
		GROUP BY url
		ORDER BY pv DESC
		LIMIT 100
	`, api.clickHouseEventsTable())

	rows, err := api.chConn.Query(ctx, query, siteID, start, end)
	if err != nil {
		slog.Error("Pages query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer rows.Close()

	type PageItem struct {
		URL         string `json:"url"`
		Title       string `json:"title"`
		PV          uint64 `json:"pageviews"`
		UV          uint64 `json:"visitors"`
		AvgDuration int    `json:"average_duration"`
	}

	pages := make([]PageItem, 0)
	for rows.Next() {
		var item PageItem
		var avgDur float64
		if err := rows.Scan(&item.URL, &item.Title, &item.PV, &item.UV, &avgDur); err != nil {
			slog.Error("Scan error", "err", err)
			continue
		}
		item.AvgDuration = int(avgDur)
		pages = append(pages, item)
	}

	c.JSON(http.StatusOK, pages)
}
