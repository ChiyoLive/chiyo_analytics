package main

import (
	"database/sql"
	"net/http"
	"strings"

	"chiyo_analytics/backend/pkg/auth"
	"chiyo_analytics/backend/pkg/config"
	"chiyo_analytics/backend/pkg/models"

	"github.com/gin-gonic/gin"
)

// CORS Middleware
func CorsMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			allowed := false
			for _, o := range cfg.API.CorsAllowedOrigins {
				if o == origin {
					allowed = true
					break
				}
			}

			if allowed {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
				c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
				c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			}
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// JWT Auth Middleware
func AuthMiddleware(pgDB *sql.DB, cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if !(len(parts) == 2 && parts[0] == "Bearer") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header must be Bearer token"})
			c.Abort()
			return
		}

		tokenStr := parts[1]
		claims, err := auth.VerifyToken(tokenStr, cfg.API.JWTSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			c.Abort()
			return
		}

		// Query database to fetch user roles/permissions and verify they exist
		uc, err := models.GetUserCyanly(c.Request.Context(), pgDB, claims.UserID)
		if err != nil || uc == nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User role record not found"})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Set("is_superuser", uc.IsSuperuser)

		c.Next()
	}
}

// SuperuserOnlyMiddleware restricts endpoint to superusers only
func SuperuserOnlyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		isSuperVal, exists := c.Get("is_superuser")
		if !exists || !isSuperVal.(bool) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden: Superuser access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}
