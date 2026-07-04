package main

import (
	"context"
	"log/slog"
	"net/http"
	"regexp"
	"time"

	"chiyo_analytics/backend/pkg/jwksurl"
	"chiyo_analytics/backend/pkg/models"
	"chiyo_analytics/backend/pkg/sitesync"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

var siteIDRegex = regexp.MustCompile(`^[a-zA-Z0-9-_]+$`)

type CreateSiteInput struct {
	ID      string  `json:"id" binding:"required,max=255"`
	Name    string  `json:"name" binding:"required,max=255"`
	JWKSURL *string `json:"jwks_url" binding:"omitempty,max=1024"`
}

type UpdateSiteInput struct {
	Name    string  `json:"name" binding:"required,max=255"`
	JWKSURL *string `json:"jwks_url" binding:"omitempty,max=1024"`
}

func (api *API) validateJWKSURL(jwksURL *string) error {
	if jwksURL == nil || *jwksURL == "" {
		return nil
	}
	return jwksurl.Validate(*jwksURL, jwksurl.Options{
		BlockPrivateNetworks: api.cfg.App.Env == "production",
	})
}

func (api *API) publishSiteChanged(siteID string) {
	if api.rdb == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	err := sitesync.Publish(ctx, api.rdb, sitesync.Event{
		Action: sitesync.ActionUpsert,
		SiteID: siteID,
	})
	if err != nil {
		slog.Warn("Failed to publish site change notification", "site_id", siteID, "err", err)
	}
}

func (api *API) ListSites(c *gin.Context) {
	sites, err := models.ListSites(c.Request.Context(), api.pgDB)
	if err != nil {
		slog.Error("ListSites database error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error fetching sites list"})
		return
	}
	c.JSON(http.StatusOK, sites)
}

func (api *API) CreateSite(c *gin.Context) {
	var input CreateSiteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate site ID format
	if !siteIDRegex.MatchString(input.ID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Site ID can only contain letters, numbers, hyphens, and underscores"})
		return
	}

	if err := api.validateJWKSURL(input.JWKSURL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	s := &models.Site{
		ID:        input.ID,
		Name:      input.Name,
		JWKSURL:   input.JWKSURL,
		CreatedAt: now,
		UpdatedAt: now,
	}

	err := models.CreateSite(c.Request.Context(), api.pgDB, s)
	if err != nil {
		if pgErr, ok := err.(*pq.Error); ok && pgErr.Code == "23505" {
			c.JSON(http.StatusConflict, gin.H{"error": "Site ID already exists"})
			return
		}
		slog.Error("CreateSite database error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create site"})
		return
	}

	api.publishSiteChanged(input.ID)
	c.JSON(http.StatusCreated, s)
}

func (api *API) UpdateSite(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Site ID parameter is required"})
		return
	}

	var input UpdateSiteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := api.validateJWKSURL(input.JWKSURL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify if site exists
	existing, err := models.GetSiteByID(c.Request.Context(), api.pgDB, id)
	if err != nil {
		slog.Error("UpdateSite check existence database error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error checking site existence"})
		return
	}
	if existing == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	err = models.UpdateSite(c.Request.Context(), api.pgDB, id, input.Name, input.JWKSURL)
	if err != nil {
		slog.Error("UpdateSite update database error", "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update site"})
		return
	}

	api.publishSiteChanged(id)
	c.JSON(http.StatusOK, gin.H{"success": true})
}
