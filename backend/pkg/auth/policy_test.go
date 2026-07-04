package auth

import (
	"testing"
)

func TestEvaluatePolicy(t *testing.T) {
	tests := []struct {
		name         string
		policies     string
		targetAction string
		want         bool
	}{
		{
			name:         "empty policies",
			policies:     "[]",
			targetAction: "read:analytics",
			want:         false,
		},
		{
			name:         "exact match allow",
			policies:     `[{"effect": "allow", "actions": ["read:analytics"]}]`,
			targetAction: "read:analytics",
			want:         true,
		},
		{
			name:         "exact match deny effect ignored",
			policies:     `[{"effect": "deny", "actions": ["read:analytics"]}]`,
			targetAction: "read:analytics",
			want:         false,
		},
		{
			name:         "wildcard match allow",
			policies:     `[{"effect": "allow", "actions": ["*"]}]`,
			targetAction: "read:analytics",
			want:         true,
		},
		{
			name:         "action mismatch",
			policies:     `[{"effect": "allow", "actions": ["read:realtime"]}]`,
			targetAction: "read:analytics",
			want:         false,
		},
		{
			name:         "multiple actions one match",
			policies:     `[{"effect": "allow", "actions": ["read:realtime", "read:analytics"]}]`,
			targetAction: "read:analytics",
			want:         true,
		},
		{
			name:         "multiple statements one match",
			policies:     `[{"effect": "allow", "actions": ["read:realtime"]}, {"effect": "allow", "actions": ["read:analytics"]}]`,
			targetAction: "read:analytics",
			want:         true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := EvaluatePolicy([]byte(tt.policies), tt.targetAction)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("EvaluatePolicy() = %v, want %v", got, tt.want)
			}
		})
	}
}
