package main

import (
	"database/sql"
	"time"

	"chiyo_analytics/backend/pkg/config"
	"chiyo_analytics/backend/pkg/models"
	"chiyo_analytics/backend/pkg/parser"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

type Collector struct {
	cfg       *config.Config
	rdb       *redis.Client
	pgDB      *sql.DB
	whitelist *SiteWhitelist
	jwksCache *JWKSCache
	parser    *parser.Parser
}

type QueueMessage struct {
	Payload   models.SDKEvent `json:"payload"`
	IP        string          `json:"ip"`
	UserAgent string          `json:"user_agent"`
	Timestamp time.Time       `json:"timestamp"`
}

type SecureTokenClaims struct {
	SiteID    string `json:"site_id"`
	SessionID string `json:"session_id"`
	jwt.RegisteredClaims
}
