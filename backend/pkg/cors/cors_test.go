package cors

import "testing"

func TestMatchOrigin(t *testing.T) {
	tests := []struct {
		name           string
		allowedOrigins []string
		origin         string
		want           bool
	}{
		{
			name:           "exact match",
			allowedOrigins: []string{"https://app.example.com"},
			origin:         "https://app.example.com",
			want:           true,
		},
		{
			name:           "single subdomain glob match",
			allowedOrigins: []string{"https://*.example.com"},
			origin:         "https://app.example.com",
			want:           true,
		},
		{
			name:           "glob matches nested subdomain",
			allowedOrigins: []string{"https://*.example.com"},
			origin:         "https://api.app.example.com",
			want:           true,
		},
		{
			name:           "glob does not match apex domain",
			allowedOrigins: []string{"https://*.example.com"},
			origin:         "https://example.com",
			want:           false,
		},
		{
			name:           "glob does not match sibling suffix",
			allowedOrigins: []string{"https://*.example.com"},
			origin:         "https://app.example.com.evil.test",
			want:           false,
		},
		{
			name:           "port must match pattern",
			allowedOrigins: []string{"https://*.example.com:8443"},
			origin:         "https://app.example.com:8443",
			want:           true,
		},
		{
			name:           "trailing slash is not normalized",
			allowedOrigins: []string{"https://app.example.com/"},
			origin:         "https://app.example.com",
			want:           false,
		},
		{
			name:           "bare wildcard is not treated as allow all",
			allowedOrigins: []string{"*"},
			origin:         "https://app.example.com",
			want:           false,
		},
		{
			name:           "invalid glob pattern is ignored",
			allowedOrigins: []string{"https://[*.example.com"},
			origin:         "https://app.example.com",
			want:           false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := MatchOrigin(tt.allowedOrigins, tt.origin); got != tt.want {
				t.Fatalf("MatchOrigin() = %v, want %v", got, tt.want)
			}
		})
	}
}
