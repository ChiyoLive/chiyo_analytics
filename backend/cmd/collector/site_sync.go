package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"time"

	"chiyo_analytics/backend/pkg/sitesync"
)

func (app *Collector) loadWhitelist(ctx context.Context) (map[string]string, error) {
	rows, err := app.pgDB.QueryContext(ctx, "SELECT id, jwks_url FROM public.sites")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sites := make(map[string]string)
	for rows.Next() {
		var id string
		var jwksURL *string
		if err := rows.Scan(&id, &jwksURL); err != nil {
			return nil, err
		}
		url := ""
		if jwksURL != nil {
			url = *jwksURL
		}
		sites[id] = url
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sites, nil
}

func (app *Collector) syncWhitelist(ctx context.Context) {
	sites, err := app.loadWhitelist(ctx)
	if err != nil {
		slog.Error("Error fetching whitelist from Postgres", "err", err)
		return
	}
	app.whitelist.Update(sites)
}

func (app *Collector) refreshSite(ctx context.Context, siteID string) error {
	if siteID == "" {
		return errors.New("site_id is required")
	}

	var jwksURL *string
	err := app.pgDB.QueryRowContext(ctx, "SELECT jwks_url FROM public.sites WHERE id = $1", siteID).Scan(&jwksURL)
	if errors.Is(err, sql.ErrNoRows) {
		app.whitelist.Delete(siteID)
		slog.Info("Removed missing site from collector whitelist", "site_id", siteID)
		return nil
	}
	if err != nil {
		return err
	}

	url := ""
	if jwksURL != nil {
		url = *jwksURL
	}
	app.whitelist.Upsert(siteID, url)
	slog.Info("Refreshed collector whitelist entry", "site_id", siteID)
	return nil
}

func (app *Collector) startWhitelistSync(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				app.syncWhitelist(ctx)
			}
		}
	}()
}

func (app *Collector) startSiteChangeSubscriber(ctx context.Context) {
	go func() {
		for {
			if err := app.runSiteChangeSubscriber(ctx); err != nil {
				if ctx.Err() != nil {
					return
				}
				slog.Warn("Site change subscription stopped; retrying", "err", err)
				time.Sleep(2 * time.Second)
			}
		}
	}()
}

func (app *Collector) runSiteChangeSubscriber(ctx context.Context) error {
	pubsub := app.rdb.Subscribe(ctx, sitesync.Channel)
	defer pubsub.Close()

	if _, err := pubsub.Receive(ctx); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case msg, ok := <-pubsub.Channel():
			if !ok {
				return errors.New("subscription channel closed")
			}
			event, err := sitesync.Decode(msg.Payload)
			if err != nil {
				slog.Warn("Ignoring malformed site change notification", "payload", msg.Payload, "err", err)
				continue
			}
			if event.Action != sitesync.ActionUpsert || event.SiteID == "" {
				slog.Warn("Ignoring unsupported site change notification", "action", event.Action, "site_id", event.SiteID)
				continue
			}
			refreshCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
			err = app.refreshSite(refreshCtx, event.SiteID)
			cancel()
			if err != nil {
				slog.Warn("Failed to refresh site after change notification", "site_id", event.SiteID, "err", err)
			}
		}
	}
}
