package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"time"

	"chiyo_analytics/backend/pkg/config"
	"chiyo_analytics/backend/pkg/db"
	"chiyo_analytics/backend/pkg/health"
	"chiyo_analytics/backend/pkg/logger"
	"chiyo_analytics/backend/pkg/parser"

	"github.com/gin-gonic/gin"
)

func main() {
	configPath := flag.String("config", "../chiyo_analytics.toml", "Path to config file")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		panic(fmt.Sprintf("Failed to load config: %v", err))
	}

	logger.Setup(cfg.App)

	if cfg.App.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Connect to Redis
	rdb, err := db.InitRedis(cfg.Redis)
	if err != nil {
		slog.Error("Failed to init Redis", "err", err)
		panic(err)
	}
	defer rdb.Close()

	// Connect to Postgres
	pgDB, err := db.InitPostgres(cfg.Postgres)
	if err != nil {
		slog.Error("Failed to init Postgres", "err", err)
		panic(err)
	}
	defer pgDB.Close()

	// Initialize Whitelist Local Cache
	whitelist := NewSiteWhitelist()
	app := &Collector{
		cfg:       cfg,
		rdb:       rdb,
		pgDB:      pgDB,
		whitelist: whitelist,
		jwksCache: NewJWKSCacheWithOptions(JWKSCacheOptions{
			BlockPrivateNetworks: cfg.App.Env == "production",
		}),
	}

	// Seed static whitelist to Postgres if sites table is empty
	ctx := context.Background()
	var count int
	err = pgDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM public.sites").Scan(&count)
	if err != nil {
		slog.Warn("Failed to check if sites table is empty", "err", err)
	} else if count == 0 && len(cfg.Collector.InitAllowedSites) > 0 {
		slog.Info("PostgreSQL sites table is empty. Seeding initial allowed sites", "sites", cfg.Collector.InitAllowedSites)
		for _, s := range cfg.Collector.InitAllowedSites {
			var jwksVal interface{}
			if s.JWKS != "" {
				jwksVal = s.JWKS
			}
			siteName := s.Name
			if siteName == "" {
				siteName = s.SiteID
			}
			_, err := pgDB.ExecContext(ctx, "INSERT INTO public.sites (id, name, jwks_url) VALUES ($1, $2, $3)", s.SiteID, siteName, jwksVal)
			if err != nil {
				slog.Warn("Failed to seed site into Postgres", "site", s.SiteID, "err", err)
			}
		}
	}

	app.syncWhitelist(context.Background())
	app.startWhitelistSync(context.Background(), 10*time.Second)
	app.startSiteChangeSubscriber(context.Background())

	// Init Parser
	pInstance := parser.NewParser(cfg.GeoIP)
	defer pInstance.Close()

	app.parser = pInstance

	r := gin.New()
	if err := r.SetTrustedProxies(cfg.Collector.TrustedProxies); err != nil {
		slog.Error("Failed to set trusted proxies", "err", err)
		panic(err)
	}
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/healthz", "/readyz"}}), gin.Recovery())

	r.GET("/healthz", health.GinHealthz)
	r.GET("/readyz", health.GinReadyz(rdb, pgDB, nil))

	// CORS & Strict Origin Check Middleware
	r.Use(CorsMiddleware(cfg))

	// Collection Endpoint
	r.POST("/collect", app.HandleCollect)
	r.GET("/collect/geo", app.HandleGeoLookup)

	if cfg.Collector.ServeSDK {
		registerSDKRoutes(r)
	}

	slog.Info("Listening", "addr", cfg.Collector.Addr)
	if err := r.Run(cfg.Collector.Addr); err != nil {
		slog.Error("Failed to run collector server", "err", err)
		panic(err)
	}
}
