package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSDKRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)

	t.Run("serve sdk enabled", func(t *testing.T) {
		r := gin.New()
		registerSDKRoutes(r)

		tests := []struct {
			path              string
			expectedType      string
			expectedMinLength int
		}{
			{"/sdk/mpa.iife.js", "application/javascript", 100},
			{"/sdk/spa.js", "application/javascript", 100},
			{"/sdk/ui/index.css", "text/css", 100},
		}

		for _, tt := range tests {
			req, _ := http.NewRequest("GET", tt.path, nil)
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Errorf("%s: expected 200, got %d", tt.path, w.Code)
			}

			contentType := w.Header().Get("Content-Type")
			if contentType == "" {
				t.Errorf("%s: missing Content-Type header", tt.path)
			}
			if len(contentType) < len(tt.expectedType) || contentType[:len(tt.expectedType)] != tt.expectedType {
				t.Errorf("%s: expected content-type prefix %q, got %q", tt.path, tt.expectedType, contentType)
			}

			cacheControl := w.Header().Get("Cache-Control")
			expectedCache := "public, max-age=300"
			if cacheControl != expectedCache {
				t.Errorf("%s: expected Cache-Control %q, got %q", tt.path, expectedCache, cacheControl)
			}

			if w.Body.Len() < tt.expectedMinLength {
				t.Errorf("%s: body too short, got %d bytes", tt.path, w.Body.Len())
			}
		}
	})
}
