import { test, expect } from "@playwright/test";

const AUTH_BASE = "http://localhost:8081/api/v1/auth";

test.describe("Auth API – Logout Endpoint", () => {
  test("POST /logout should revoke the session and reject subsequent refresh/rotate attempts", async ({
    request,
  }) => {
    // Step 1: Login to get tokens
    console.log("--- Step 1: Logging in to get fresh tokens ---");
    const loginRes = await request.post(`${AUTH_BASE}/login`, {
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const refreshToken = loginData.refresh_token;
    expect(refreshToken).toBeDefined();

    // Step 2: Verify the refresh token works before logout
    console.log("--- Step 2: Verifying refresh token is valid before logout ---");
    const preLogoutRefresh = await request.post(`${AUTH_BASE}/refresh`, {
      data: { refresh_token: refreshToken },
    });
    expect(preLogoutRefresh.status()).toBe(200);
    const preLogoutData = await preLogoutRefresh.json();
    expect(preLogoutData.access_token).toBeDefined();

    // Step 3: Logout (revoke session)
    console.log("--- Step 3: Calling POST /logout to revoke session ---");
    const logoutRes = await request.post(`${AUTH_BASE}/logout`, {
      data: { refresh_token: refreshToken },
    });
    expect(logoutRes.status()).toBe(200);
    const logoutData = await logoutRes.json();
    expect(logoutData.success).toBe(true);

    // Step 4: Attempt to refresh with the revoked token — should fail
    console.log("--- Step 4: Attempting refresh with revoked token (expect 401) ---");
    const refreshRes = await request.post(`${AUTH_BASE}/refresh`, {
      data: { refresh_token: refreshToken },
    });
    expect(refreshRes.status()).toBe(401);
    const refreshData = await refreshRes.json();
    expect(refreshData.error).toContain("revoked");

    // Step 5: Attempt to rotate with the revoked token — should also fail
    console.log("--- Step 5: Attempting rotate with revoked token (expect 401) ---");
    const rotateRes = await request.post(`${AUTH_BASE}/rotate`, {
      data: { refresh_token: refreshToken },
    });
    expect(rotateRes.status()).toBe(401);
    const rotateData = await rotateRes.json();
    expect(rotateData.error).toContain("revoked");

    console.log("--- Logout endpoint verified: session revoked, refresh/rotate correctly rejected ---");
  });

  test("POST /logout should reject an invalid refresh token (401)", async ({
    request,
  }) => {
    const res = await request.post(`${AUTH_BASE}/logout`, {
      data: { refresh_token: "invalid-refresh-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /logout should reject a missing refresh token (400)", async ({
    request,
  }) => {
    const res = await request.post(`${AUTH_BASE}/logout`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Auth API – Me Endpoint", () => {
  test("GET /me should return the authenticated superuser profile with correct structure", async ({
    request,
  }) => {
    // Step 1: Login to get access token
    console.log("--- Step 1: Logging in to get access token ---");
    const loginRes = await request.post(`${AUTH_BASE}/login`, {
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const accessToken = loginData.access_token;

    // Step 2: Call GET /me with valid token
    console.log("--- Step 2: Calling GET /me with valid Bearer token ---");
    const meRes = await request.get(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status()).toBe(200);
    const profile = await meRes.json();

    // Validate all expected fields
    expect(typeof profile.id).toBe("string");
    expect(profile.id.length).toBeGreaterThan(0);
    expect(profile.email).toBe("admin@cyanly.local");
    expect(typeof profile.is_superuser).toBe("boolean");
    expect(profile.is_superuser).toBe(true);
    expect(Array.isArray(profile.permissions)).toBe(true);
    expect(profile.permissions).toContain("admin");
    expect(Array.isArray(profile.sites)).toBe(true);

    // Avatar field should exist (can be null for default superuser)
    expect("avatar" in profile).toBe(true);

    console.log(
      `--- /me verified: id=${profile.id}, email=${profile.email}, superuser=${profile.is_superuser}, permissions=${profile.permissions}, sites=${profile.sites.length} ---`,
    );
  });

  test("GET /me should reject requests without Authorization header (401)", async ({
    request,
  }) => {
    const res = await request.get(`${AUTH_BASE}/me`);
    expect(res.status()).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Authorization header required");
  });

  test("GET /me should reject requests with invalid Bearer token (401)", async ({
    request,
  }) => {
    const res = await request.get(`${AUTH_BASE}/me`, {
      headers: { Authorization: "Bearer invalid-or-expired-jwt-token" },
    });
    expect(res.status()).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid or expired token");
  });
});
