package privacy

import "testing"

func TestRequiresDefaultAnonymization(t *testing.T) {
	tests := []struct {
		countryCode string
		expected    bool
	}{
		{countryCode: "DE", expected: true},
		{countryCode: "gb", expected: true},
		{countryCode: "NO", expected: true},
		{countryCode: "CH", expected: true},
		{countryCode: "US", expected: false},
		{countryCode: "JP", expected: false},
	}

	for _, tt := range tests {
		t.Run(tt.countryCode, func(t *testing.T) {
			actual := RequiresDefaultAnonymization(tt.countryCode)
			if actual != tt.expected {
				t.Fatalf("expected %v, got %v", tt.expected, actual)
			}
		})
	}
}
