package jwksurl

import "testing"

func TestNormalize(t *testing.T) {
	got, err := Normalize("HTTPS://EXAMPLE.COM:443/.well-known/jwks.json")
	if err != nil {
		t.Fatalf("Normalize returned error: %v", err)
	}
	want := "https://example.com/.well-known/jwks.json"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestValidateJWKSURL(t *testing.T) {
	tests := []struct {
		name    string
		rawURL  string
		opts    Options
		wantErr bool
	}{
		{
			name:   "allows localhost in development",
			rawURL: "http://127.0.0.1/jwks.json",
		},
		{
			name:    "blocks localhost in production",
			rawURL:  "http://127.0.0.1/jwks.json",
			opts:    Options{BlockPrivateNetworks: true},
			wantErr: true,
		},
		{
			name:    "blocks cloud metadata endpoint",
			rawURL:  "http://169.254.169.254/latest/meta-data",
			wantErr: true,
		},
		{
			name:    "rejects non http scheme",
			rawURL:  "ftp://example.com/jwks.json",
			wantErr: true,
		},
		{
			name:    "rejects userinfo",
			rawURL:  "https://user@example.com/jwks.json",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(tt.rawURL, tt.opts)
			if tt.wantErr && err == nil {
				t.Fatal("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
		})
	}
}
