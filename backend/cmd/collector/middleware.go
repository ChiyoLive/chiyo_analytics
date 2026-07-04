package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"

	"chiyo_analytics/backend/pkg/config"

	"github.com/gin-gonic/gin"
)

func CorsMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		referer := c.GetHeader("Referer")

		// 1. Resolve request origin/domain
		reqOrigin := origin
		if reqOrigin == "" && referer != "" {
			// Extract domain from Referer header
			u, err := url.Parse(referer)
			if err == nil {
				reqOrigin = fmt.Sprintf("%s://%s", u.Scheme, u.Host)
			}
		}

		// 2. Validate Origin
		allowed := false
		if reqOrigin != "" {
			for _, o := range cfg.Collector.CorsAllowedOrigins {
				if o == reqOrigin {
					allowed = true
					break
				}
			}
		} else {
			// Fallback: allow requests with missing Origin/Referer headers (like local curl testing)
			allowed = true
		}

		if reqOrigin != "" && !allowed {
			slog.Warn("Rejected request from unauthorized origin", "origin", reqOrigin)
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized origin"})
			c.Abort()
			return
		}

		if reqOrigin != "" && allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			if origin == "" && referer != "" {
				c.Writer.Header().Set("Access-Control-Allow-Origin", reqOrigin)
			}
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
