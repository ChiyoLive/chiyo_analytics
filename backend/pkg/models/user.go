package models

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"time"
)

type User struct {
	ID        string    `json:"id"`
	Username  string    `json:"username"`
	Nickname  string    `json:"nickname"`
	Email     string    `json:"email"`
	Password  string    `json:"-"`
	Avatar    *string   `json:"avatar"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type UserCyanly struct {
	UserID      string    `json:"user_id"`
	IsSuperuser bool      `json:"is_superuser"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UserSite struct {
	UserID      string          `json:"user_id"`
	SiteID      string          `json:"site_id"`
	Permissions json.RawMessage `json:"permissions"`
}

type UserSession struct {
	ID              string     `json:"id"`
	UserID          string     `json:"user_id"`
	RefreshTokenJTI string     `json:"refresh_token_jti"`
	DeviceName      string     `json:"device_name"`
	DeviceType      string     `json:"device_type"`
	UserAgent       string     `json:"user_agent"`
	IPAddress       string     `json:"ip_address"`
	ExpiresAt       time.Time  `json:"expires_at"`
	LastRefreshAt   time.Time  `json:"last_refresh_at"`
	RevokedAt       *time.Time `json:"revoked_at"`
	CreatedAt       time.Time  `json:"created_at"`
}

// CreateUser inserts a user and their user_cyanlys record within a transaction.
func CreateUser(ctx context.Context, db *sql.DB, u *User, uc *UserCyanly) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Insert User
	queryUser := `
		INSERT INTO public.users (id, username, nickname, email, password, avatar, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err = tx.ExecContext(ctx, queryUser, u.ID, u.Username, u.Nickname, u.Email, u.Password, u.Avatar, u.CreatedAt, u.UpdatedAt)
	if err != nil {
		return err
	}

	// Insert UserCyanly (excluding permissions array)
	queryCyanly := `
		INSERT INTO public.user_cyanlys (user_id, is_superuser, created_at, updated_at)
		VALUES ($1, $2, $3, $4)
	`
	_, err = tx.ExecContext(ctx, queryCyanly, uc.UserID, uc.IsSuperuser, uc.CreatedAt, uc.UpdatedAt)
	if err != nil {
		return err
	}

	return tx.Commit()
}

// GetUserByEmail fetches user from DB by email.
func GetUserByEmail(ctx context.Context, db *sql.DB, email string) (*User, error) {
	query := `
		SELECT id, username, nickname, email, password, avatar, created_at, updated_at
		FROM public.users
		WHERE email = $1
	`
	var u User
	err := db.QueryRowContext(ctx, query, email).Scan(&u.ID, &u.Username, &u.Nickname, &u.Email, &u.Password, &u.Avatar, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// GetUserByID fetches user from DB by ID.
func GetUserByID(ctx context.Context, db *sql.DB, id string) (*User, error) {
	query := `
		SELECT id, username, nickname, email, password, avatar, created_at, updated_at
		FROM public.users
		WHERE id = $1
	`
	var u User
	err := db.QueryRowContext(ctx, query, id).Scan(&u.ID, &u.Username, &u.Nickname, &u.Email, &u.Password, &u.Avatar, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// GetUserCyanly fetches profile details from DB by UserID.
func GetUserCyanly(ctx context.Context, db *sql.DB, userID string) (*UserCyanly, error) {
	query := `
		SELECT user_id, is_superuser, created_at, updated_at
		FROM public.user_cyanlys
		WHERE user_id = $1
	`
	var uc UserCyanly
	err := db.QueryRowContext(ctx, query, userID).Scan(&uc.UserID, &uc.IsSuperuser, &uc.CreatedAt, &uc.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &uc, nil
}

// CreateUserSession inserts a new session into PostgreSQL.
func CreateUserSession(ctx context.Context, db *sql.DB, s *UserSession) error {
	query := `
		INSERT INTO public.user_sessions (
			id, user_id, refresh_token_jti, device_name, device_type, user_agent, ip_address, expires_at, last_refresh_at, revoked_at, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err := db.ExecContext(ctx, query,
		s.ID, s.UserID, s.RefreshTokenJTI, s.DeviceName, s.DeviceType, s.UserAgent, s.IPAddress, s.ExpiresAt, s.LastRefreshAt, s.RevokedAt, s.CreatedAt,
	)
	return err
}

// GetUserSessionByJTI fetches user_sessions by refresh_token_jti.
func GetUserSessionByJTI(ctx context.Context, db *sql.DB, jti string) (*UserSession, error) {
	query := `
		SELECT id, user_id, refresh_token_jti, device_name, device_type, user_agent, ip_address, expires_at, last_refresh_at, revoked_at, created_at
		FROM public.user_sessions
		WHERE refresh_token_jti = $1
	`
	var s UserSession
	err := db.QueryRowContext(ctx, query, jti).Scan(
		&s.ID, &s.UserID, &s.RefreshTokenJTI, &s.DeviceName, &s.DeviceType, &s.UserAgent, &s.IPAddress, &s.ExpiresAt, &s.LastRefreshAt, &s.RevokedAt, &s.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

// RevokeUserSession marks the session as revoked in the database.
func RevokeUserSession(ctx context.Context, db *sql.DB, jti string) error {
	query := `
		UPDATE public.user_sessions
		SET revoked_at = $1
		WHERE refresh_token_jti = $2 AND revoked_at IS NULL
	`
	_, err := db.ExecContext(ctx, query, time.Now(), jti)
	return err
}

// GetUserSite fetches a specific user_sites mapping including permissions.
func GetUserSite(ctx context.Context, db *sql.DB, userID, siteID string) (*UserSite, error) {
	query := `
		SELECT user_id, site_id, permissions
		FROM public.user_sites
		WHERE user_id = $1 AND site_id = $2
	`
	var us UserSite
	var permissionsRaw []byte
	err := db.QueryRowContext(ctx, query, userID, siteID).Scan(&us.UserID, &us.SiteID, &permissionsRaw)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	us.Permissions = json.RawMessage(permissionsRaw)
	return &us, nil
}

// AddUserSiteWithPermissions links a user to a site ID with specific permissions.
func AddUserSiteWithPermissions(ctx context.Context, db *sql.DB, userID, siteID string, permissions []byte) error {
	query := `
		INSERT INTO public.user_sites (user_id, site_id, permissions)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, site_id) DO UPDATE SET permissions = EXCLUDED.permissions
	`
	_, err := db.ExecContext(ctx, query, userID, siteID, permissions)
	return err
}
