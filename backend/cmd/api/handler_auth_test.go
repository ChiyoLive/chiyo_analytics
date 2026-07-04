package main

import (
	"testing"
	"time"
)

func TestParseTTL(t *testing.T) {
	tests := []struct {
		input    string
		expected time.Duration
		hasErr   bool
	}{
		{"15m", 15 * time.Minute, false},
		{"2h", 2 * time.Hour, false},
		{"30d", 30 * 24 * time.Hour, false},
		{"1d", 24 * time.Hour, false},
		{"invalid", 0, true},
		{"", 0, true},
	}

	for _, tc := range tests {
		got, err := parseTTL(tc.input)
		if tc.hasErr {
			if err == nil {
				t.Errorf("parseTTL(%q) expected error, got nil", tc.input)
			}
		} else {
			if err != nil {
				t.Errorf("parseTTL(%q) unexpected error: %v", tc.input, err)
			}
			if got != tc.expected {
				t.Errorf("parseTTL(%q) = %v; want %v", tc.input, got, tc.expected)
			}
		}
	}
}
