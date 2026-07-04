package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type CreateUserInput struct {
	Username    string `json:"username" binding:"required"`
	Nickname    string `json:"nickname" binding:"required"`
	Email       string `json:"email" binding:"required,email"`
	Password    string `json:"password" binding:"required"`
	IsSuperuser bool   `json:"is_superuser"`
	Sites       []struct {
		SiteID      string          `json:"site_id" binding:"required"`
		Permissions json.RawMessage `json:"permissions" binding:"required"`
	} `json:"sites"`
}

func (api *API) ListUsers(c *gin.Context) {
	query := `
		SELECT u.id, u.username, u.nickname, u.email, u.created_at, u.updated_at,
		       uc.is_superuser,
		       COALESCE(
		           json_agg(
		               json_build_object('site_id', us.site_id, 'permissions', us.permissions)
		           ) FILTER (WHERE us.site_id IS NOT NULL),
		           '[]'::json
		       ) as sites
		FROM public.users u
		JOIN public.user_cyanlys uc ON u.id = uc.user_id
		LEFT JOIN public.user_sites us ON u.id = us.user_id
		GROUP BY u.id, uc.is_superuser, u.username, u.nickname, u.email, u.created_at, u.updated_at
		ORDER BY u.created_at DESC
	`

	rows, err := api.pgDB.QueryContext(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error fetching users list"})
		return
	}
	defer rows.Close()

	type UserListItem struct {
		ID          string          `json:"id"`
		Username    string          `json:"username"`
		Nickname    string          `json:"nickname"`
		Email       string          `json:"email"`
		IsSuperuser bool            `json:"is_superuser"`
		Sites       json.RawMessage `json:"sites"`
		CreatedAt   time.Time       `json:"created_at"`
		UpdatedAt   time.Time       `json:"updated_at"`
	}

	users := make([]UserListItem, 0)
	for rows.Next() {
		var u UserListItem
		var sitesRaw []byte
		err := rows.Scan(&u.ID, &u.Username, &u.Nickname, &u.Email, &u.CreatedAt, &u.UpdatedAt, &u.IsSuperuser, &sitesRaw)
		if err != nil {
			slog.Warn("ListUsers: failed to scan user row", "error", err)
			continue
		}
		u.Sites = json.RawMessage(sitesRaw)
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error reading users list"})
		return
	}

	c.JSON(http.StatusOK, users)
}

func (api *API) CreateUser(c *gin.Context) {
	var input CreateUserInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate site permissions JSON format
	for _, site := range input.Sites {
		var statements []interface{}
		if err := json.Unmarshal(site.Permissions, &statements); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Site permissions must be a valid JSON array"})
			return
		}
	}
	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	// Begin Tx
	tx, err := api.pgDB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start database transaction"})
		return
	}
	defer tx.Rollback()

	newUserID := uuid.New().String()
	now := time.Now()

	// 1. Insert User
	queryUser := `
		INSERT INTO public.users (id, username, nickname, email, password, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`
	_, err = tx.ExecContext(c.Request.Context(), queryUser, newUserID, input.Username, input.Nickname, input.Email, string(hashedPassword), now, now)
	if err != nil {
		if pgErr, ok := err.(*pq.Error); ok && pgErr.Code == "23505" {
			c.JSON(http.StatusConflict, gin.H{"error": "Username or Email already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to insert user profile"})
		return
	}

	// 2. Insert UserCyanly
	queryCyanly := `
		INSERT INTO public.user_cyanlys (user_id, is_superuser, created_at, updated_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err = tx.ExecContext(c.Request.Context(), queryCyanly, newUserID, input.IsSuperuser, now, now)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to insert user metadata"})
		return
	}

	// 3. Insert UserSites
	for _, site := range input.Sites {
		querySite := `
			INSERT INTO public.user_sites (user_id, site_id, permissions)
			VALUES ($1, $2, $3)
		`
		_, err = tx.ExecContext(c.Request.Context(), querySite, newUserID, site.SiteID, site.Permissions)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to assign site permissions"})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction commit failed"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":           newUserID,
		"username":     input.Username,
		"nickname":     input.Nickname,
		"email":        input.Email,
		"is_superuser": input.IsSuperuser,
	})
}

func (api *API) DeleteUser(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID parameter is required"})
		return
	}

	// Prevent deleting yourself
	currentUserIDVal, exists := c.Get("user_id")
	if exists && currentUserIDVal.(string) == id {
		c.JSON(http.StatusForbidden, gin.H{"error": "You cannot delete your own superuser account"})
		return
	}

	res, err := api.pgDB.ExecContext(c.Request.Context(), `DELETE FROM public.users WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error deleting user"})
		return
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking result"})
		return
	}

	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type UpdateSitePermissionsInput struct {
	Permissions json.RawMessage `json:"permissions" binding:"required"`
}

func (api *API) UpdateUserSitePermissions(c *gin.Context) {
	userID := c.Param("id")
	siteID := c.Param("site_id")
	if userID == "" || siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID and Site ID parameters are required"})
		return
	}

	var input UpdateSitePermissionsInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate JSON array structure
	var statements []interface{}
	if err := json.Unmarshal(input.Permissions, &statements); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Site permissions must be a valid JSON array"})
		return
	}

	// Update query
	query := `
		UPDATE public.user_sites
		SET permissions = $3
		WHERE user_id = $1 AND site_id = $2
	`
	res, err := api.pgDB.ExecContext(c.Request.Context(), query, userID, siteID, input.Permissions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error updating site permissions"})
		return
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking update result"})
		return
	}

	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User site association not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (api *API) DeleteUserSitePermission(c *gin.Context) {
	userID := c.Param("id")
	siteID := c.Param("site_id")
	if userID == "" || siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID and Site ID parameters are required"})
		return
	}

	res, err := api.pgDB.ExecContext(c.Request.Context(), `DELETE FROM public.user_sites WHERE user_id = $1 AND site_id = $2`, userID, siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error deleting site permission"})
		return
	}

	rowsAffected, err := res.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking result"})
		return
	}

	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site association not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

type AddUserSiteInput struct {
	SiteID      string          `json:"site_id" binding:"required"`
	Permissions json.RawMessage `json:"permissions" binding:"required"`
}

func (api *API) AddUserSitePermission(c *gin.Context) {
	userID := c.Param("id")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID parameter is required"})
		return
	}

	var input AddUserSiteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate JSON array structure
	var statements []interface{}
	if err := json.Unmarshal(input.Permissions, &statements); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Site permissions must be a valid JSON array"})
		return
	}

	// Check if user is superuser
	var isSuperuser bool
	checkSuperuserQuery := `SELECT is_superuser FROM public.user_cyanlys WHERE user_id = $1`
	err := api.pgDB.QueryRowContext(c.Request.Context(), checkSuperuserQuery, userID).Scan(&isSuperuser)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking user metadata"})
		return
	}
	if isSuperuser {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Superuser account does not require site permissions"})
		return
	}

	// Insert query
	query := `
		INSERT INTO public.user_sites (user_id, site_id, permissions)
		VALUES ($1, $2, $3)
	`
	_, err = api.pgDB.ExecContext(c.Request.Context(), query, userID, input.SiteID, input.Permissions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to assign site permission. Make sure site is not already assigned."})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"success": true})
}

type UpdateUserInput struct {
	Username    string  `json:"username" binding:"required"`
	Nickname    string  `json:"nickname" binding:"required"`
	Email       string  `json:"email" binding:"required,email"`
	Password    *string `json:"password"`
	IsSuperuser bool    `json:"is_superuser"`
}

func (api *API) UpdateUser(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "User ID parameter is required"})
		return
	}

	var input UpdateUserInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check self-demotion before starting transaction
	currentUserIDVal, exists := c.Get("user_id")
	if exists && currentUserIDVal.(string) == id && !input.IsSuperuser {
		c.JSON(http.StatusForbidden, gin.H{"error": "You cannot remove your own superuser status"})
		return
	}

	// Begin Tx
	tx, err := api.pgDB.BeginTx(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start database transaction"})
		return
	}
	defer tx.Rollback()

	// Update user profile
	var queryUser string
	var args []interface{}
	if input.Password != nil && *input.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(*input.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
			return
		}
		queryUser = `
			UPDATE public.users
			SET username = $2, nickname = $3, email = $4, password = $5, updated_at = $6
			WHERE id = $1
		`
		args = []interface{}{id, input.Username, input.Nickname, input.Email, string(hashedPassword), time.Now()}
	} else {
		queryUser = `
			UPDATE public.users
			SET username = $2, nickname = $3, email = $4, updated_at = $5
			WHERE id = $1
		`
		args = []interface{}{id, input.Username, input.Nickname, input.Email, time.Now()}
	}

	res, err := tx.ExecContext(c.Request.Context(), queryUser, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user profile. Make sure username and email are unique."})
		return
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	// Update user_cyanlys is_superuser

	queryCyanly := `
		UPDATE public.user_cyanlys
		SET is_superuser = $2, updated_at = $3
		WHERE user_id = $1
	`
	_, err = tx.ExecContext(c.Request.Context(), queryCyanly, id, input.IsSuperuser, time.Now())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user metadata"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Transaction commit failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
