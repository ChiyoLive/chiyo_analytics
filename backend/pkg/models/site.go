package models

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

type Site struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	JWKSURL   *string   `json:"jwks_url"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// CreateSite inserts a new site into the database.
func CreateSite(ctx context.Context, db *sql.DB, s *Site) error {
	query := `
		INSERT INTO public.sites (id, name, jwks_url, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := db.ExecContext(ctx, query, s.ID, s.Name, s.JWKSURL, s.CreatedAt, s.UpdatedAt)
	return err
}

// UpdateSite updates an existing site's name and jwks_url.
func UpdateSite(ctx context.Context, db *sql.DB, id string, name string, jwksURL *string) error {
	query := `
		UPDATE public.sites
		SET name = $2, jwks_url = $3, updated_at = $4
		WHERE id = $1
	`
	_, err := db.ExecContext(ctx, query, id, name, jwksURL, time.Now())
	return err
}

// GetSiteByID retrieves a site by its ID.
func GetSiteByID(ctx context.Context, db *sql.DB, id string) (*Site, error) {
	query := `
		SELECT id, name, jwks_url, created_at, updated_at
		FROM public.sites
		WHERE id = $1
	`
	var s Site
	err := db.QueryRowContext(ctx, query, id).Scan(&s.ID, &s.Name, &s.JWKSURL, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

// ListSites retrieves all sites ordered by creation date descending.
func ListSites(ctx context.Context, db *sql.DB) ([]Site, error) {
	query := `
		SELECT id, name, jwks_url, created_at, updated_at
		FROM public.sites
		ORDER BY created_at DESC
	`
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sites := make([]Site, 0)
	for rows.Next() {
		var s Site
		if err := rows.Scan(&s.ID, &s.Name, &s.JWKSURL, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, err
		}
		sites = append(sites, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return sites, nil
}
