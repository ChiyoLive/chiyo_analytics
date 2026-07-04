package main

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetCustomEvents returns counts for custom (non-pageview) events within the
// requested time range, aggregated by event name. Pageviews are excluded
// because they are surfaced by the dedicated pageview endpoints; this endpoint
// is the read path for custom events emitted via the SDK's trackEvent / declarative tracking.
func (api *API) GetCustomEvents(c *gin.Context) {
	siteID, start, end, ok := parseTimeParams(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	query := fmt.Sprintf(`
		SELECT
			event_name AS name,
			count() AS count,
			uniq(visitor_id) AS visitors
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name != 'pageview'
		GROUP BY event_name
		ORDER BY count DESC
		LIMIT 100
	`, api.clickHouseEventsTable())

	rows, err := api.chConn.Query(ctx, query, siteID, start, end)
	if err != nil {
		slog.Error("CustomEvents query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer rows.Close()

	type EventItem struct {
		Name     string `json:"name"`
		Count    uint64 `json:"count"`
		Visitors uint64 `json:"visitors"`
	}

	events := make([]EventItem, 0)
	for rows.Next() {
		var item EventItem
		if err := rows.Scan(&item.Name, &item.Count, &item.Visitors); err != nil {
			slog.Error("Scan error", "err", err)
			continue
		}
		events = append(events, item)
	}

	c.JSON(http.StatusOK, events)
}
