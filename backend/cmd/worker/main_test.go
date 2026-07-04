package main

import (
	"testing"
)

func TestShouldAnonymize(t *testing.T) {
	strPtr := func(s string) *string {
		return &s
	}

	tests := []struct {
		name        string
		consent     *string
		countryCode string
		isGpcOrDnt  bool
		expected    bool
	}{
		// Legacy string values
		{
			name:        "Legacy granted",
			consent:     strPtr("granted"),
			countryCode: "DE",
			isGpcOrDnt:  false,
			expected:    false,
		},
		{
			name:        "Legacy denied",
			consent:     strPtr("denied"),
			countryCode: "US",
			isGpcOrDnt:  false,
			expected:    true,
		},

		// JSON string values
		{
			name:        "JSON personalization true",
			consent:     strPtr(`{"required":true,"functional":true,"personalization":true}`),
			countryCode: "DE",
			isGpcOrDnt:  false,
			expected:    false,
		},
		{
			name:        "JSON personalization false",
			consent:     strPtr(`{"required":true,"functional":true,"personalization":false}`),
			countryCode: "US",
			isGpcOrDnt:  false,
			expected:    true,
		},
		{
			name:        "JSON required only",
			consent:     strPtr(`{"required":true,"functional":false,"personalization":false}`),
			countryCode: "JP",
			isGpcOrDnt:  false,
			expected:    true,
		},
		{
			name:        "JSON malformed",
			consent:     strPtr(`{"required":true,"functional":`),
			countryCode: "JP",
			isGpcOrDnt:  false,
			expected:    true,
		},
		{
			name:        "Unknown string",
			consent:     strPtr(`maybe`),
			countryCode: "JP",
			isGpcOrDnt:  false,
			expected:    true,
		},

		// Nil consent (location fallback & GPC/DNT check)
		{
			name:        "Nil consent - EU location",
			consent:     nil,
			countryCode: "DE",
			isGpcOrDnt:  false,
			expected:    true,
		},
		{
			name:        "Nil consent - CN location",
			consent:     nil,
			countryCode: "CN",
			isGpcOrDnt:  false,
			expected:    true,
		},
		{
			name:        "Nil consent - lowercase CN location",
			consent:     nil,
			countryCode: "cn",
			isGpcOrDnt:  false,
			expected:    true,
		},
		{
			name:        "Nil consent - US location with GPC",
			consent:     nil,
			countryCode: "US",
			isGpcOrDnt:  true,
			expected:    true,
		},
		{
			name:        "Nil consent - US location without GPC",
			consent:     nil,
			countryCode: "US",
			isGpcOrDnt:  false,
			expected:    false,
		},
		{
			name:        "Nil consent - JP location with DNT",
			consent:     nil,
			countryCode: "JP",
			isGpcOrDnt:  true,
			expected:    true,
		},
		{
			name:        "Nil consent - JP location without DNT",
			consent:     nil,
			countryCode: "JP",
			isGpcOrDnt:  false,
			expected:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := shouldAnonymize(tt.consent, tt.countryCode, tt.isGpcOrDnt)
			if actual != tt.expected {
				t.Errorf("expected %v, got %v", tt.expected, actual)
			}
		})
	}
}

func TestMaskIP(t *testing.T) {
	tests := []struct {
		name     string
		ip       string
		expected string
	}{
		{name: "IPv4", ip: "203.0.113.42", expected: "203.0.113.0"},
		{name: "IPv6", ip: "2001:db8:abcd:1234::1", expected: "2001:db8:abcd::"},
		{name: "Invalid", ip: "not-an-ip", expected: "not-an-ip"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := maskIP(tt.ip)
			if actual != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, actual)
			}
		})
	}
}
