import { test, expect } from "@playwright/test";

// Helper to decode JWT in Node.js test process
function parseJwt(token: string) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

test.describe("JWT Refresh Token Rotation & Expiration E2E Verification", () => {
  test("should proactively refresh access token, rotate refresh token, enforce replay protection, and handle complete expiration", async ({
    page,
    request,
  }) => {
    // 1. Initial login to get short-lived tokens (duration configured in chiyo_analytics.e2e.toml)
    console.log("--- Step 1: Logging in to get tokens ---");
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const initAccessToken = loginData.access_token;
    const initRefreshToken = loginData.refresh_token;

    expect(initAccessToken).toBeDefined();
    expect(initRefreshToken).toBeDefined();

    // Parse lifetimes dynamically from JWT claims
    const accessClaims = parseJwt(initAccessToken);
    const refreshClaims = parseJwt(initRefreshToken);
    expect(accessClaims).not.toBeNull();
    expect(refreshClaims).not.toBeNull();

    const accessDuration = accessClaims.exp - accessClaims.iat;
    const refreshDuration = refreshClaims.exp - refreshClaims.iat;
    const accessThreshold = Math.min(60, accessDuration * 0.2);
    const refreshThreshold = Math.min(86400, refreshDuration * 0.2);

    console.log(`Parsed Expirations - Access: ${accessDuration}s (threshold: ${accessThreshold}s), Refresh: ${refreshDuration}s (threshold: ${refreshThreshold}s)`);

    // Install a fake clock on the page to manually drive the refresher's setInterval
    await page.clock.install();

    // 2. Load the login page, inject the tokens, and navigate to dashboard
    console.log("--- Step 2: Injecting tokens into localStorage and loading dashboard ---");
    await page.goto("http://localhost:8079/en/login");
    await page.evaluate(({ token, refresh }) => {
      localStorage.setItem("cyanly_access_token", token);
      localStorage.setItem("cyanly_refresh_token", refresh);
    }, { token: initAccessToken, refresh: initRefreshToken });

    // Navigate to homepage where <AuthRefresher /> is active
    await page.goto("http://localhost:8079/en?site_id=example-next-js");
    await expect(page.locator("body")).toContainText(/Chiyo Analytics|Unique Visitors/i);

    // Let the in-flight mount requests settle
    await page.waitForTimeout(1000);

    // 3. Test Proactive Access Token Refresh
    console.log("--- Step 3: Fast-forwarding clock to trigger Access Token Refresh ---");
    // Fast-forward to just after the access token threshold is reached
    // remaining time <= threshold => elapsed >= duration - threshold
    const accessElapsedToTrigger = accessDuration - accessThreshold + 1;
    console.log(`Fast-forwarding browser clock by ${accessElapsedToTrigger}s`);

    const refreshRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/auth/refresh") && req.method() === "POST",
      { timeout: 5000 }
    );

    await page.clock.fastForward(accessElapsedToTrigger * 1000);

    const refreshReq = await refreshRequestPromise;
    console.log("-> Proactive Access Token Refresh triggered successfully!");
    expect(refreshReq).toBeDefined();

    // Wait for local storage update (use polling to avoid race conditions)
    let midAccessToken = "";
    await expect(async () => {
      midAccessToken = await page.evaluate(() => localStorage.getItem("cyanly_access_token")) || "";
      expect(midAccessToken).toBeTruthy();
      expect(midAccessToken).not.toBe(initAccessToken);
    }).toPass({ timeout: 5000 });

    // 4. Test Proactive Refresh Token Rotation
    console.log("--- Step 4: Fast-forwarding clock to trigger Refresh Token Rotation ---");
    // Fast-forward remaining time to hit the refresh token threshold
    // remaining time <= threshold => elapsed >= duration - threshold
    const refreshElapsedToTrigger = refreshDuration - refreshThreshold + 1;
    // Calculate how much further we need to advance the clock
    const additionalAdvance = refreshElapsedToTrigger - accessElapsedToTrigger;
    console.log(`Fast-forwarding browser clock by additional ${additionalAdvance}s`);

    const rotateRequestPromise = page.waitForRequest(
      (req) => req.url().includes("/api/v1/auth/rotate") && req.method() === "POST",
      { timeout: 5000 }
    );

    await page.clock.fastForward(additionalAdvance * 1000);

    const rotateReq = await rotateRequestPromise;
    console.log("-> Proactive Refresh Token Rotation triggered successfully!");
    expect(rotateReq).toBeDefined();

    // Wait for local storage update (use polling to avoid race conditions)
    let finalAccessToken = "";
    let finalRefreshToken = "";
    await expect(async () => {
      const tokens = await page.evaluate(() => [
        localStorage.getItem("cyanly_access_token"),
        localStorage.getItem("cyanly_refresh_token"),
      ]);
      finalAccessToken = tokens[0] || "";
      finalRefreshToken = tokens[1] || "";
      expect(finalAccessToken).toBeTruthy();
      expect(finalRefreshToken).toBeTruthy();
      expect(finalRefreshToken).not.toBe(initRefreshToken);
    }).toPass({ timeout: 5000 });

    const authedRes = await request.get(
      "http://localhost:8081/api/v1/analytics/overview",
      {
        headers: { Authorization: `Bearer ${finalAccessToken}` },
        params: { site_id: "example-next-js", range: "24h" },
      },
    );
    expect(authedRes.status()).toBe(200);

    // 5. Test Replay Protection of Old Refresh Token
    console.log("--- Step 5: Testing Replay Protection of Old (Rotated) Refresh Token ---");
    const replayRes = await request.post("http://localhost:8081/api/v1/auth/rotate", {
      data: {
        refresh_token: initRefreshToken,
      },
    });
    expect(replayRes.status()).toBe(401);
    const replayData = await replayRes.json();
    expect(replayData.error).toContain("revoked");
    console.log("-> Replay protection verified: old refresh token was successfully rejected!");

    // 6. Test complete expiration and redirect to /login
    console.log("--- Step 6: Testing complete expiration redirect ---");
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await expect(page).toHaveURL(/.*\/login/);
    console.log("-> Expiration redirect verified successfully!");
  });
});
