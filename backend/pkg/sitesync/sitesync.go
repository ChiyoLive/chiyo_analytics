package sitesync

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
)

const (
	Channel      = "cyanly:sites:changed"
	ActionUpsert = "upsert"
)

type Event struct {
	Action string `json:"action"`
	SiteID string `json:"site_id"`
}

func Publish(ctx context.Context, rdb *redis.Client, event Event) error {
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	return rdb.Publish(ctx, Channel, data).Err()
}

func Decode(payload string) (Event, error) {
	var event Event
	err := json.Unmarshal([]byte(payload), &event)
	return event, err
}
