package main

import (
	"net/http"
	"testing"
	"time"
)

func TestJWKSCacheExpiry(t *testing.T) {
	now := time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name   string
		header http.Header
		want   time.Time
	}{
		{
			name: "cache control max age",
			header: http.Header{
				"Cache-Control": []string{"public, max-age=30"},
			},
			want: now.Add(30 * time.Second),
		},
		{
			name: "cache control no cache",
			header: http.Header{
				"Cache-Control": []string{"no-cache"},
			},
			want: now,
		},
		{
			name: "cache control max ttl cap",
			header: http.Header{
				"Cache-Control": []string{"max-age=172800"},
			},
			want: now.Add(maxJWKSCacheTTL),
		},
		{
			name: "expires",
			header: http.Header{
				"Expires": []string{now.Add(15 * time.Minute).Format(http.TimeFormat)},
			},
			want: now.Add(15 * time.Minute),
		},
		{
			name:   "default",
			header: http.Header{},
			want:   now.Add(defaultJWKSCacheTTL),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := jwksCacheExpiry(tt.header, now)
			if !got.Equal(tt.want) {
				t.Fatalf("expected %s, got %s", tt.want, got)
			}
		})
	}
}
