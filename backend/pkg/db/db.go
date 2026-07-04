package db

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	"chiyo_analytics/backend/pkg/config"

	"github.com/ClickHouse/clickhouse-go/v2"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

func InitRedis(cfg config.RedisConfig) (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping redis: %w", err)
	}

	slog.Info("Successfully connected to Redis")
	return rdb, nil
}

func InitClickHouse(cfg config.ClickHouseConfig) (clickhouse.Conn, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.Addr},
		Auth: clickhouse.Auth{
			Database: cfg.Database,
			Username: cfg.Username,
			Password: cfg.Password,
		},
		DialTimeout: time.Second * 10,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to open ClickHouse connection: %w", err)
	}

	ctx := context.Background()
	if err := conn.Ping(ctx); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to ping ClickHouse: %w", err)
	}

	slog.Info("Successfully connected to ClickHouse")
	return conn, nil
}

func InitPostgres(cfg config.PostgresConfig) (*sql.DB, error) {
	auth := ""
	if cfg.Username != "" {
		auth = cfg.Username
		if cfg.Password != "" {
			auth += ":" + cfg.Password
		}
		auth += "@"
	}
	dsn := fmt.Sprintf("postgres://%s%s/%s?sslmode=%s", auth, cfg.Addr, cfg.Database, cfg.SSLMode)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open Postgres connection: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping Postgres: %w", err)
	}

	slog.Info("Successfully connected to Postgres")
	return db, nil
}
