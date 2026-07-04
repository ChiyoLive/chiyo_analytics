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
	"chiyo_analytics/backend/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
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

	// Connect to ClickHouse
	chConn, err := db.InitClickHouse(cfg.ClickHouse)
	if err != nil {
		slog.Error("Failed to init ClickHouse", "err", err)
		panic(fmt.Sprintf("Failed to init ClickHouse: %v", err))
	}
	defer chConn.Close()

	// Connect to Postgres
	pgDB, err := db.InitPostgres(cfg.Postgres)
	if err != nil {
		slog.Error("Failed to init Postgres", "err", err)
		panic(fmt.Sprintf("Failed to init Postgres: %v", err))
	}
	defer pgDB.Close()

	// Seed default superuser if empty
	if cfg.API.Superuser.Email != "" && cfg.API.Superuser.Password != "" {
		ctx := context.Background()
		existingUser, err := models.GetUserByEmail(ctx, pgDB, cfg.API.Superuser.Email)
		if err != nil {
			slog.Error("Failed to check if superuser exists", "err", err)
		} else if existingUser == nil {
			slog.Info("Seeding default superuser", "email", cfg.API.Superuser.Email)
			hashedPassword, err := bcrypt.GenerateFromPassword([]byte(cfg.API.Superuser.Password), bcrypt.DefaultCost)
			if err != nil {
				slog.Error("Failed to hash default superuser password", "err", err)
			} else {
				u := &models.User{
					ID:        uuid.New().String(),
					Username:  cfg.API.Superuser.Username,
					Nickname:  cfg.API.Superuser.Nickname,
					Email:     cfg.API.Superuser.Email,
					Password:  string(hashedPassword),
					CreatedAt: time.Now(),
					UpdatedAt: time.Now(),
				}
				uc := &models.UserCyanly{
					UserID:      u.ID,
					IsSuperuser: true,
					CreatedAt:   time.Now(),
					UpdatedAt:   time.Now(),
				}
				if err := models.CreateUser(ctx, pgDB, u, uc); err != nil {
					slog.Error("Failed to seed default superuser in database", "err", err)
				} else {
					slog.Info("Successfully seeded default superuser")
				}
			}
		} else {
			slog.Info("Superuser already exists", "email", cfg.API.Superuser.Email)
		}
	}

	// Connect to Redis
	rdb, err := db.InitRedis(cfg.Redis)
	if err != nil {
		slog.Error("Failed to init Redis", "err", err)
		panic(fmt.Sprintf("Failed to init Redis: %v", err))
	}
	defer rdb.Close()

	api := &API{
		chConn: chConn,
		pgDB:   pgDB,
		rdb:    rdb,
		cfg:    cfg,
	}

	r := gin.New()
	if err := r.SetTrustedProxies(cfg.API.TrustedProxies); err != nil {
		slog.Error("Failed to set trusted proxies", "err", err)
		panic(fmt.Sprintf("Failed to set trusted proxies: %v", err))
	}
	r.Use(gin.LoggerWithConfig(gin.LoggerConfig{SkipPaths: []string{"/healthz", "/readyz"}}), gin.Recovery())

	r.GET("/healthz", health.GinHealthz)
	r.GET("/readyz", health.GinReadyz(rdb, pgDB, chConn))

	// CORS Middleware
	r.Use(CorsMiddleware(cfg))

	// Auth Routes
	authRoutes := r.Group("/api/v1/auth")
	{
		authRoutes.POST("/login", api.Login)
		authRoutes.POST("/refresh", api.Refresh)
		authRoutes.POST("/rotate", api.Rotate)
		authRoutes.POST("/logout", api.Logout)
		authRoutes.GET("/me", AuthMiddleware(pgDB, cfg), api.GetMe)
	}

	// User Management Routes (Superuser Only)
	userRoutes := r.Group("/api/v1/users")
	userRoutes.Use(AuthMiddleware(pgDB, cfg), SuperuserOnlyMiddleware())
	{
		userRoutes.GET("", api.ListUsers)
		userRoutes.POST("", api.CreateUser)
		userRoutes.DELETE("/:id", api.DeleteUser)
		userRoutes.PUT("/:id", api.UpdateUser)
		userRoutes.PUT("/:id/sites/:site_id", api.UpdateUserSitePermissions)
		userRoutes.DELETE("/:id/sites/:site_id", api.DeleteUserSitePermission)
		userRoutes.POST("/:id/sites", api.AddUserSitePermission)
	}

	// Site Management Routes (Superuser Only)
	siteRoutes := r.Group("/api/v1/sites")
	siteRoutes.Use(AuthMiddleware(pgDB, cfg), SuperuserOnlyMiddleware())
	{
		siteRoutes.GET("", api.ListSites)
		siteRoutes.POST("", api.CreateSite)
		siteRoutes.PUT("/:id", api.UpdateSite)
	}

	// Analytics Routes
	apiRoutes := r.Group("/api/v1/analytics")
	apiRoutes.Use(AuthMiddleware(pgDB, cfg))
	apiRoutes.Use(api.SiteAccessMiddleware())
	{
		apiRoutes.GET("/overview", api.GetOverview)
		apiRoutes.GET("/sources", api.GetSources)
		apiRoutes.GET("/pages", api.GetPages)
		apiRoutes.GET("/devices", api.GetDevices)
		apiRoutes.GET("/time_series", api.GetTimeSeries)
		apiRoutes.GET("/events", api.GetCustomEvents)
		apiRoutes.GET("/recent_sessions", api.GetRecentSessions)
		apiRoutes.GET("/visitor", api.GetVisitorProfile)
	}

	slog.Info("[API] Query API listening on", "addr", cfg.API.Addr)
	if err := r.Run(cfg.API.Addr); err != nil {
		slog.Error("Failed to run API server", "err", err)
		panic(err)
	}
}
