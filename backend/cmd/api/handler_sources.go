package main

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (api *API) GetSources(c *gin.Context) {
	siteID, start, end, ok := parseTimeParams(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	// 1. Query Top Referrers
	refQuery := fmt.Sprintf(`
		SELECT
			if(referrer = '' OR domain(referrer) = '', 'Direct / None', domain(referrer)) AS source,
			count() AS pv,
			uniq(visitor_id) AS uv
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview'
		  AND (referrer = '' OR domain(referrer) = '' OR domain(referrer) != domain(url))
		GROUP BY source
		ORDER BY pv DESC
		LIMIT 50
	`, api.clickHouseEventsTable())

	rows, err := api.chConn.Query(ctx, refQuery, siteID, start, end)
	if err != nil {
		slog.Error("Referrer query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer rows.Close()

	type ReferrerItem struct {
		Source string `json:"source"`
		PV     uint64 `json:"pageviews"`
		UV     uint64 `json:"visitors"`
	}

	referrers := make([]ReferrerItem, 0)
	for rows.Next() {
		var item ReferrerItem
		if err := rows.Scan(&item.Source, &item.PV, &item.UV); err != nil {
			slog.Error("Scan error", "err", err)
			continue
		}
		referrers = append(referrers, item)
	}

	// 2. Query UTM Parameters
	utmQuery := fmt.Sprintf(`
		SELECT
			utm_source,
			utm_medium,
			utm_campaign,
			count() AS pv,
			uniq(visitor_id) AS uv
		FROM %s
		WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview' AND utm_source != ''
		GROUP BY utm_source, utm_medium, utm_campaign
		ORDER BY pv DESC
		LIMIT 50
	`, api.clickHouseEventsTable())

	utmRows, err := api.chConn.Query(ctx, utmQuery, siteID, start, end)
	if err != nil {
		slog.Error("UTM query error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Query failed"})
		return
	}
	defer utmRows.Close()

	type UTMItem struct {
		Source   string `json:"source"`
		Medium   string `json:"medium"`
		Campaign string `json:"campaign"`
		PV       uint64 `json:"pageviews"`
		UV       uint64 `json:"visitors"`
	}

	utms := make([]UTMItem, 0)
	for utmRows.Next() {
		var item UTMItem
		if err := utmRows.Scan(&item.Source, &item.Medium, &item.Campaign, &item.PV, &item.UV); err != nil {
			slog.Error("UTM Scan error", "err", err)
			continue
		}
		utms = append(utms, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"referrers": referrers,
		"utm":       utms,
	})
}
