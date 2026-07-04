package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"chiyo_analytics/backend/pkg/auth"
	"chiyo_analytics/backend/pkg/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/mileusna/useragent"
	"golang.org/x/crypto/bcrypt"
)

var dayRegex = regexp.MustCompile(`^([0-9]+)d$`)

func parseTTL(s string) (time.Duration, error) {
	matches := dayRegex.FindStringSubmatch(s)
	if len(matches) == 2 {
		days, err := strconv.Atoi(matches[1])
		if err != nil {
			return 0, err
		}
		return time.Duration(days) * 24 * time.Hour, nil
	}
	return time.ParseDuration(s)
}

// Helper to generate secure random strings
func generateRandomString(length int) (string, error) {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

type LoginInput struct {
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required"`
	DeviceName string `json:"device_name"`
	DeviceType string `json:"device_type"`
}

func (api *API) reserveLoginAttempt(c *gin.Context, ip string) bool {
	ctx := c.Request.Context()
	key := "cyanly:ratelimit:login:" + ip

	count, err := api.rdb.Incr(ctx, key).Result()
	if err != nil {
		return true // fail open
	}
	if count == 1 {
		api.rdb.Expire(ctx, key, 15*time.Minute)
	}
	return count <= 5
}

func (api *API) recordLoginSuccess(c *gin.Context, ip string) {
	ctx := c.Request.Context()
	key := "cyanly:ratelimit:login:" + ip
	api.rdb.Del(ctx, key)
}

func (api *API) Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	clientIP := c.ClientIP()
	if !api.reserveLoginAttempt(c, clientIP) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Too many login attempts. Please try again later."})
		return
	}

	u, err := models.GetUserByEmail(c.Request.Context(), api.pgDB, input.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	// Compare password
	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email or password"})
		return
	}

	api.recordLoginSuccess(c, clientIP)

	// Parse User Agent for device details if not provided
	uaStr := c.GetHeader("User-Agent")
	ua := useragent.Parse(uaStr)

	deviceName := input.DeviceName
	if deviceName == "" {
		if ua.OS != "" {
			deviceName = ua.OS
			if ua.Name != "" {
				deviceName += " / " + ua.Name
			}
		} else {
			deviceName = "Unknown Device"
		}
	}

	deviceType := input.DeviceType
	if deviceType == "" {
		if ua.Mobile {
			deviceType = "mobile"
		} else if ua.Tablet {
			deviceType = "tablet"
		} else if ua.Desktop {
			deviceType = "desktop"
		} else {
			deviceType = "unknown"
		}
	}

	// Generate JTI for Refresh Token
	jti, err := generateRandomString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session"})
		return
	}

	// Parse configured durations
	accessTokenDuration, err := parseTTL(api.cfg.API.AccessTokenExpiry)
	if err != nil {
		accessTokenDuration = 15 * time.Minute
	}
	refreshTokenDuration, err := parseTTL(api.cfg.API.RefreshTokenExpiry)
	if err != nil {
		refreshTokenDuration = 30 * 24 * time.Hour
	}

	// Generate Access Token (JWT)
	accessToken, err := auth.GenerateToken(u.ID, u.Email, "", api.cfg.API.JWTSecret, accessTokenDuration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Generate Refresh Token (JWT)
	refreshToken, err := auth.GenerateToken(u.ID, u.Email, jti, api.cfg.API.JWTSecret, refreshTokenDuration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Create session
	session := &models.UserSession{
		ID:              uuid.New().String(),
		UserID:          u.ID,
		RefreshTokenJTI: jti,
		DeviceName:      deviceName,
		DeviceType:      deviceType,
		UserAgent:       uaStr,
		IPAddress:       c.ClientIP(),
		ExpiresAt:       time.Now().Add(refreshTokenDuration),
		LastRefreshAt:   time.Now(),
		CreatedAt:       time.Now(),
	}

	if err := models.CreateUserSession(c.Request.Context(), api.pgDB, session); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}

type RefreshInput struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (api *API) Refresh(c *gin.Context) {
	var input RefreshInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify Refresh Token JWT
	claims, err := auth.VerifyToken(input.RefreshToken, api.cfg.API.JWTSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}
	jti := claims.ID

	session, err := models.GetUserSessionByJTI(c.Request.Context(), api.pgDB, jti)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if session == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	// Check if session has expired or is revoked
	if session.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token has expired"})
		return
	}
	if session.RevokedAt != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token has been revoked"})
		return
	}

	u, err := models.GetUserByID(c.Request.Context(), api.pgDB, session.UserID)
	if err != nil || u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	// Update session last refresh time
	query := `UPDATE public.user_sessions SET last_refresh_at = $1 WHERE refresh_token_jti = $2`
	if _, err := api.pgDB.ExecContext(c.Request.Context(), query, time.Now(), jti); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update session"})
		return
	}

	// Parse configured access token duration
	accessTokenDuration, err := parseTTL(api.cfg.API.AccessTokenExpiry)
	if err != nil {
		accessTokenDuration = 15 * time.Minute
	}

	// Generate new access token
	accessToken, err := auth.GenerateToken(u.ID, u.Email, "", api.cfg.API.JWTSecret, accessTokenDuration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token": accessToken,
		"expires_in":   int(accessTokenDuration.Seconds()),
	})
}

type LogoutInput struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (api *API) Logout(c *gin.Context) {
	var input LogoutInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify Refresh Token JWT
	claims, err := auth.VerifyToken(input.RefreshToken, api.cfg.API.JWTSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}
	jti := claims.ID

	if err := models.RevokeUserSession(c.Request.Context(), api.pgDB, jti); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type RotateInput struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

func (api *API) Rotate(c *gin.Context) {
	var input RotateInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify Refresh Token JWT
	claims, err := auth.VerifyToken(input.RefreshToken, api.cfg.API.JWTSecret)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired refresh token"})
		return
	}
	oldJTI := claims.ID

	session, err := models.GetUserSessionByJTI(c.Request.Context(), api.pgDB, oldJTI)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}
	if session == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid refresh token"})
		return
	}

	// Check if session has expired or is revoked
	if session.ExpiresAt.Before(time.Now()) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token has expired"})
		return
	}
	if session.RevokedAt != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Refresh token has been revoked"})
		return
	}

	u, err := models.GetUserByID(c.Request.Context(), api.pgDB, session.UserID)
	if err != nil || u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
		return
	}

	// Invalidate the old session
	if err := models.RevokeUserSession(c.Request.Context(), api.pgDB, oldJTI); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to revoke old session"})
		return
	}

	// Create new session using current request details (IP, UA)
	uaStr := c.GetHeader("User-Agent")
	ua := useragent.Parse(uaStr)

	deviceName := ua.OS
	if ua.Name != "" {
		deviceName += " / " + ua.Name
	}
	if deviceName == "" {
		deviceName = "Unknown Device"
	}

	deviceType := "unknown"
	if ua.Mobile {
		deviceType = "mobile"
	} else if ua.Tablet {
		deviceType = "tablet"
	} else if ua.Desktop {
		deviceType = "desktop"
	}

	newJTI, err := generateRandomString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate session"})
		return
	}

	accessTokenDuration, err := parseTTL(api.cfg.API.AccessTokenExpiry)
	if err != nil {
		accessTokenDuration = 15 * time.Minute
	}
	refreshTokenDuration, err := parseTTL(api.cfg.API.RefreshTokenExpiry)
	if err != nil {
		refreshTokenDuration = 30 * 24 * time.Hour
	}

	// Generate Access Token (JWT)
	accessToken, err := auth.GenerateToken(u.ID, u.Email, "", api.cfg.API.JWTSecret, accessTokenDuration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Generate new Refresh Token (JWT)
	newRefreshToken, err := auth.GenerateToken(u.ID, u.Email, newJTI, api.cfg.API.JWTSecret, refreshTokenDuration)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// Create new session
	newSession := &models.UserSession{
		ID:              uuid.New().String(),
		UserID:          u.ID,
		RefreshTokenJTI: newJTI,
		DeviceName:      deviceName,
		DeviceType:      deviceType,
		UserAgent:       uaStr,
		IPAddress:       c.ClientIP(),
		ExpiresAt:       time.Now().Add(refreshTokenDuration),
		LastRefreshAt:   time.Now(),
		CreatedAt:       time.Now(),
	}

	if err := models.CreateUserSession(c.Request.Context(), api.pgDB, newSession); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": newRefreshToken,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}

func (api *API) GetMe(c *gin.Context) {
	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}
	userID := userIDVal.(string)

	u, err := models.GetUserByID(c.Request.Context(), api.pgDB, userID)
	if err != nil || u == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	uc, err := models.GetUserCyanly(c.Request.Context(), api.pgDB, userID)
	if err != nil || uc == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load user permissions"})
		return
	}

	type UserSiteInfo struct {
		SiteID      string          `json:"site_id"`
		Name        string          `json:"name"`
		Permissions json.RawMessage `json:"permissions"`
	}

	userSites := make([]UserSiteInfo, 0)
	if uc.IsSuperuser {
		rows, err := api.pgDB.QueryContext(c.Request.Context(), `
			SELECT id, name
			FROM public.sites
			ORDER BY name ASC
		`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load system sites for superuser"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var si UserSiteInfo
			if err := rows.Scan(&si.SiteID, &si.Name); err != nil {
				slog.Warn("GetMe: failed to scan superuser site row", "error", err)
				continue
			}
			si.Permissions = json.RawMessage(`[{"effect": "allow", "actions": ["*"]}]`)
			userSites = append(userSites, si)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error reading system sites"})
			return
		}
	} else {
		rows, err := api.pgDB.QueryContext(c.Request.Context(), `
			SELECT us.site_id, s.name, us.permissions 
			FROM public.user_sites us
			JOIN public.sites s ON us.site_id = s.id
			WHERE us.user_id = $1
			ORDER BY s.name ASC
		`, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load user sites"})
			return
		}
		defer rows.Close()

		for rows.Next() {
			var si UserSiteInfo
			var permRaw []byte
			if err := rows.Scan(&si.SiteID, &si.Name, &permRaw); err != nil {
				slog.Warn("GetMe: failed to scan user site row", "error", err)
				continue
			}
			si.Permissions = json.RawMessage(permRaw)
			userSites = append(userSites, si)
		}
		if err := rows.Err(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Error reading user sites"})
			return
		}
	}

	var activeSessions int
	sessionQuery := `
		SELECT COUNT(*) 
		FROM public.user_sessions 
		WHERE user_id = $1 AND expires_at > NOW() AND revoked_at IS NULL
	`
	if err := api.pgDB.QueryRowContext(c.Request.Context(), sessionQuery, userID).Scan(&activeSessions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to count active sessions"})
		return
	}

	permissions := []string{}
	if uc.IsSuperuser {
		permissions = append(permissions, "admin")
	}

	c.JSON(http.StatusOK, gin.H{
		"id":              u.ID,
		"username":        u.Username,
		"nickname":        u.Nickname,
		"email":           u.Email,
		"avatar":          u.Avatar,
		"permissions":     permissions,
		"sites":           userSites,
		"is_superuser":    uc.IsSuperuser,
		"active_sessions": activeSessions,
	})
}

// CheckSiteAccess helper checks if user is allowed to access siteID
func (api *API) CheckSiteAccess(c *gin.Context, siteID string) bool {
	if siteID == "" {
		return true
	}

	isSuperVal, exists := c.Get("is_superuser")
	if exists && isSuperVal.(bool) {
		return true
	}

	userIDVal, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		c.Abort()
		return false
	}
	userID := userIDVal.(string)

	// Fetch site mapping including permissions JSONB
	userSite, err := models.GetUserSite(c.Request.Context(), api.pgDB, userID, siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking site access"})
		c.Abort()
		return false
	}

	if userSite == nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have access to this site"})
		c.Abort()
		return false
	}

	// Determine required action based on URL path
	path := c.Request.URL.Path
	requiredAction := "read:analytics"
	if strings.HasSuffix(path, "/recent_sessions") || strings.HasSuffix(path, "/visitor") {
		requiredAction = "read:realtime"
	}

	allowed, err := auth.EvaluatePolicy(userSite.Permissions, requiredAction)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error evaluating permission policy"})
		c.Abort()
		return false
	}

	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "You do not have permission for this action on this site"})
		c.Abort()
		return false
	}

	return true
}

// SiteAccessMiddleware blocks non-authorized users from calling site analytics APIs
func (api *API) SiteAccessMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		siteID := c.Query("site_id")
		if siteID != "" {
			if !api.CheckSiteAccess(c, siteID) {
				return
			}
		}
		c.Next()
	}
}
