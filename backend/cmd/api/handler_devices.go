package main

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (api *API) GetDevices(c *gin.Context) {
	siteID, start, end, ok := parseTimeParams(c)
	if !ok {
		return
	}

	ctx := c.Request.Context()

	type CountItem struct {
		Name  string `json:"name"`
		Count uint64 `json:"count"`
	}

	queryHelper := func(field string, limit int) []CountItem {
		q := fmt.Sprintf(`
			SELECT %s AS name, count() AS count
			FROM %s
			WHERE site_id = ? AND timestamp >= ? AND timestamp <= ? AND event_name = 'pageview'
			GROUP BY name
			ORDER BY count DESC
			LIMIT %d
		`, field, api.clickHouseEventsTable(), limit)

		rows, err := api.chConn.Query(ctx, q, siteID, start, end)
		if err != nil {
			slog.Error("Devices query error", "field", field, "err", err)
			return []CountItem{}
		}
		defer rows.Close()

		items := make([]CountItem, 0)
		for rows.Next() {
			var item CountItem
			if err := rows.Scan(&item.Name, &item.Count); err != nil {
				continue
			}
			items = append(items, item)
		}
		return items
	}

	c.JSON(http.StatusOK, gin.H{
		"device_types":      queryHelper("device_type", 10),
		"operating_systems": queryHelper("os_name", 10),
		"browsers":          queryHelper("browser_name", 10),
		"countries":         queryHelper("country", 15),
	})
}
