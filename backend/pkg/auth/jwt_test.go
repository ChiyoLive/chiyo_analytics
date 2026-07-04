package auth

import (
	"testing"
	"time"
)

func TestGenerateAndVerifyToken(t *testing.T) {
	secret := "test-secret-key"
	userID := "user-123"
	email := "test@example.com"
	jti := "session-jti-abc"
	duration := 5 * time.Minute

	// Generate token
	tokenStr, err := GenerateToken(userID, email, jti, secret, duration)
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Verify token
	claims, err := VerifyToken(tokenStr, secret)
	if err != nil {
		t.Fatalf("Failed to verify token: %v", err)
	}

	// Check claims
	if claims.UserID != userID {
		t.Errorf("Expected UserID %q, got %q", userID, claims.UserID)
	}
	if claims.Email != email {
		t.Errorf("Expected Email %q, got %q", email, claims.Email)
	}
	if claims.ID != jti {
		t.Errorf("Expected JTI %q, got %q", jti, claims.ID)
	}
	if claims.Subject != userID {
		t.Errorf("Expected Subject %q, got %q", userID, claims.Subject)
	}
}

func TestVerifyTokenInvalidSignature(t *testing.T) {
	tokenStr, _ := GenerateToken("u1", "u1@ex.com", "j1", "secret1", 5*time.Minute)
	_, err := VerifyToken(tokenStr, "secret2")
	if err == nil {
		t.Error("Expected error verifying token with wrong secret, got nil")
	}
}
