package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"chiyo_analytics/backend/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// allowedSigningMethods restricts secure tokens to asymmetric algorithms.
// HMAC ("HS*") and "none" are intentionally excluded to prevent algorithm
// confusion attacks against keys fetched from a user's JWKS endpoint.
var allowedSigningMethods = []string{
	"RS256", "RS384", "RS512",
	"PS256", "PS384", "PS512",
	"ES256", "ES384", "ES512",
	"EdDSA",
}

// maxEventNameLen bounds event_name length. event_name is part of the
// ClickHouse ORDER BY key, so an unbounded public endpoint could otherwise let
// callers blow up sort-key cardinality.
const maxEventNameLen = 64

// isValidEventName enforces the storage-layer constraints on event_name: a
// non-empty name within the length cap and free of control characters. It is
// not an authenticity check (see HandleCollect).
func isValidEventName(name string) bool {
	if name == "" || len(name) > maxEventNameLen {
		return false
	}
	for _, r := range name {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}

func bearerTokenFromRequest(c *gin.Context) string {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		return ""
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		return ""
	}
	return parts[1]
}

type secureTokenValidationOptions struct {
	requireSession bool
	sessionID      string
}

func (app *Collector) validateSiteAndSecureToken(
	siteID string,
	tokenStr string,
	options secureTokenValidationOptions,
) (bool, string) {
	jwksURL, ok := app.whitelist.Check(siteID)
	if siteID == "" || !ok {
		return false, "Unauthorized or unknown site_id"
	}

	if jwksURL == "" {
		return true, ""
	}

	if tokenStr == "" {
		return false, "Secure token is required"
	}

	var claims SecureTokenClaims
	token, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (interface{}, error) {
		kid, ok := t.Header["kid"].(string)
		if !ok || kid == "" {
			return nil, fmt.Errorf("missing kid in token header")
		}

		// The actual public key type (RSA / ECDSA / Ed25519) is determined
		// by the "kty" advertised in the user's JWKS. golang-jwt then enforces
		// that the token's alg matches the returned key type.
		pubKey, err := app.jwksCache.GetPublicKey(jwksURL, kid)
		if err != nil {
			return nil, err
		}
		return pubKey, nil
	}, jwt.WithValidMethods(allowedSigningMethods))

	if err != nil || !token.Valid {
		return false, fmt.Sprintf("Invalid or expired secure token: %v", err)
	}

	if claims.SiteID != siteID {
		return false, "Token site_id mismatch"
	}
	if options.requireSession && claims.SessionID != options.sessionID {
		return false, "Token session_id mismatch"
	}

	return true, ""
}

func (app *Collector) HandleCollect(c *gin.Context) {
	var sdkEvent models.SDKEvent
	if err := c.ShouldBindJSON(&sdkEvent); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request payload"})
		return
	}
	if sdkEvent.EventName == "" {
		sdkEvent.EventName = "pageview"
	}
	// event_name is part of the ClickHouse ORDER BY key. /collect is a public
	// endpoint, so we cannot trust the client not to flood it with arbitrary
	// names. We do NOT reject "pageview" here: the endpoint is public and a
	// forged client can always send event_name=pageview directly, so a
	// reserved-word check would protect nothing. These bounds exist to protect
	// the storage layer (sort-key cardinality), not to guarantee authenticity.
	if !isValidEventName(sdkEvent.EventName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid event_name"})
		return
	}
	if len(sdkEvent.Properties) > 4096 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "properties exceeds 4KB limit"})
		return
	}
	// properties is documented as a JSON object string. Reject anything that is
	// not valid JSON so malformed payloads never reach ClickHouse.
	if sdkEvent.Properties != "" && !json.Valid([]byte(sdkEvent.Properties)) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "properties must be valid JSON"})
		return
	}

	valid, validationErr := app.validateSiteAndSecureToken(sdkEvent.SiteID, sdkEvent.Token, secureTokenValidationOptions{
		requireSession: true,
		sessionID:      sdkEvent.SessionID,
	})
	if !valid {
		slog.Warn("collect 403 by siteID check", "event", sdkEvent)
		c.JSON(http.StatusForbidden, gin.H{"error": validationErr})
		return
	}

	// Extract IP and UA
	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")

	// Prepare queue message
	msg := QueueMessage{
		Payload:   sdkEvent,
		IP:        ip,
		UserAgent: ua,
		Timestamp: time.Now().UTC(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Serialization failed"})
		return
	}

	// Push to Redis Stream using a background context with timeout
	// to prevent drops if the client connection is abruptly closed during page unload.
	writeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err = app.rdb.XAdd(writeCtx, &redis.XAddArgs{
		Stream: app.cfg.Redis.Key,
		MaxLen: 100000,
		Approx: true,
		ID:     "*",
		Values: map[string]interface{}{
			"payload": string(data),
		},
	}).Err()
	if err != nil {
		slog.Error("Error pushing to Redis Stream", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Buffer write failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (app *Collector) HandleGeoLookup(c *gin.Context) {
	siteID := c.Query("site_id")
	token := bearerTokenFromRequest(c)
	valid, validationErr := app.validateSiteAndSecureToken(siteID, token, secureTokenValidationOptions{})
	if !valid {
		c.JSON(http.StatusForbidden, gin.H{"error": validationErr})
		return
	}

	ip := c.ClientIP()
	parsed := app.parser.Parse(ip, "")
	c.JSON(http.StatusOK, gin.H{
		"country": parsed.CountryCode,
	})
}
