package main

import (
	"testing"
)

func TestValidateSiteAndSecureToken(t *testing.T) {
	app := &Collector{
		whitelist: &SiteWhitelist{
			allowed: map[string]string{
				"open-site":   "",
				"secure-site": "http://127.0.0.1/jwks",
			},
		},
		jwksCache: NewJWKSCache(),
	}

	tests := []struct {
		name        string
		siteID      string
		token       string
		expectedOK  bool
		expectedErr string
	}{
		{
			name:       "open site without token",
			siteID:     "open-site",
			expectedOK: true,
		},
		{
			name:        "unknown site",
			siteID:      "missing-site",
			expectedOK:  false,
			expectedErr: "Unauthorized or unknown site_id",
		},
		{
			name:        "secure site requires token",
			siteID:      "secure-site",
			expectedOK:  false,
			expectedErr: "Secure token is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ok, errText := app.validateSiteAndSecureToken(tt.siteID, tt.token, secureTokenValidationOptions{})
			if ok != tt.expectedOK {
				t.Fatalf("expected ok=%v, got %v", tt.expectedOK, ok)
			}
			if errText != tt.expectedErr {
				t.Fatalf("expected err %q, got %q", tt.expectedErr, errText)
			}
		})
	}
}
