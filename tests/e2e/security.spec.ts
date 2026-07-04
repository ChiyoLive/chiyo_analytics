import { test, expect, type TestInfo } from "@playwright/test";

let jwtToken = "";

type AnalyticsPage = {
  url: string;
  title: string;
};

type RecentSession = {
  visitor_id: string;
  actions: {
    url: string;
    title: string;
  }[];
};

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function uniqueForwardedIp(testInfo: TestInfo, salt: string): string {
  const seed = hashString(
    `${testInfo.project.name}:${testInfo.workerIndex}:${testInfo.title}:${salt}:${Date.now()}:${Math.random()}`,
  );
  return `10.${(seed >>> 16) & 255}.${(seed >>> 8) & 255}.${seed & 255}`;
}

test.beforeEach(async ({ request }) => {
  const res = await request.post("http://localhost:8081/api/v1/auth/login", {
    data: {
      email: "admin@cyanly.local",
      password: "cyanly-admin-secure-password",
    },
  });
  if (res.ok()) {
    const data = await res.json();
    jwtToken = data.access_token;
  }
});

test.describe("Chiyo Analytics Security & Protection Verification (Red/Blue Team)", () => {
  // Test 1: Origin & Referer Verification
  test("should reject events from unauthorized Origin/Referer headers (403 Forbidden)", async ({
    request,
  }) => {
    // Send request with an unauthorized origin
    const response = await request.post("http://localhost:8080/collect", {
      headers: {
        Origin: "http://evil-attacker.com",
        "Content-Type": "application/json",
      },
      data: {
        site_id: "test-no-token-site",
        visitor_id: "v123",
        session_id: "s123",
        url: "http://localhost:13001/",
        title: "Home Page",
      },
    });

    expect(response.status()).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized origin");
  });

  // Test 2: Dynamic Site ID Whitelisting
  test("should reject events with unauthorized or unknown site_ids (403 Forbidden)", async ({
    request,
  }) => {
    // Send request with a spoofed site ID
    const response = await request.post("http://localhost:8080/collect", {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        site_id: "unauthorized-or-malicious-site-id",
        visitor_id: "v123",
        session_id: "s123",
        url: "http://localhost:13001/",
        title: "Home Page",
      },
    });

    expect(response.status()).toBe(403);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized or unknown site_id");
  });

  // Test 3: API Protection (Bearer Token Auth)
  test("should block unauthorized requests to the Query API", async ({
    request,
  }) => {
    // Case A: Missing Authorization Header
    const missingTokenRes = await request.get(
      "http://localhost:8081/api/v1/analytics/overview",
      {
        params: { site_id: "test-site-id" },
      },
    );
    expect(missingTokenRes.status()).toBe(401);

    // Case B: Incorrect/Invalid Bearer Token
    const invalidTokenRes = await request.get(
      "http://localhost:8081/api/v1/analytics/overview",
      {
        headers: {
          Authorization: "Bearer attacker-fake-token",
        },
        params: { site_id: "test-site-id" },
      },
    );
    expect(invalidTokenRes.status()).toBe(401);
  });

  // Test 4: SQL Injection Safety
  test("should handle SQL injection payloads safely as literal values", async ({
    request,
  }) => {
    const sqlPayload =
      "http://localhost:13001/products/1'; DROP TABLE events; --";

    // Fetch a secure token first from Next.js example
    const tokenResponse = await request.get(
      "http://localhost:13001/api/cyanly-token?sessionId=s-sql-inject",
    );
    expect(tokenResponse.status()).toBe(200);
    const { token } = await tokenResponse.json();

    // Ingest event with SQL injection string in URL field and the token
    const collectResponse = await request.post(
      "http://localhost:8080/collect",
      {
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          site_id: "example-next-js",
          visitor_id: "v-sql-inject",
          session_id: "s-sql-inject",
          url: sqlPayload,
          title: "SQL Inject Test Title",
          token: token,
        },
      },
    );
    expect(collectResponse.status()).toBe(200);

    // Wait for worker to flush to ClickHouse
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify database remains intact and the SQL payload is treated as a literal URL string
    const apiResponse = await request.get(
      "http://localhost:8081/api/v1/analytics/pages",
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        params: {
          site_id: "example-next-js",
          range: "24h",
        },
      },
    );
    expect(apiResponse.status()).toBe(200);

    const pages = (await apiResponse.json()) as AnalyticsPage[];
    // Check if the page list includes our SQL payload page
    const injectedPage = pages.find((p) => p.url === sqlPayload);
    expect(injectedPage).toBeDefined();
    if (injectedPage === undefined) {
      throw new Error("SQL injection payload page was not found");
    }
    expect(injectedPage.title).toBe("SQL Inject Test Title");
  });

  // Test 5: Malformed JSON Payload handling
  test("should reject malformed JSON formats (400 Bad Request)", async ({
    request,
  }) => {
    const rawMalformedData = "{ site_id: 'test-site-id', malformed_json "; // invalid JSON structure

    const response = await request.post("http://localhost:8080/collect", {
      headers: {
        "Content-Type": "application/json",
      },
      data: rawMalformedData,
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request payload");
  });

  // Test 6: Cross-Tenant Data Access (Tenant Isolation)
  test("should reject querying analytics for unauthorized sites (403 Forbidden)", async ({
    request,
  }) => {
    // Create a normal user with access ONLY to 'example-next-js'
    const testUsername = `rbac_user_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    
    await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${jwtToken}` },
      data: {
        username: testUsername,
        nickname: "RBAC User",
        email: testEmail,
        password: "password123",
        is_superuser: false,
        sites: [
          {
            site_id: "example-next-js",
            permissions: [{ effect: "allow", actions: ["read:analytics"] }],
          },
        ],
      },
    });

    // Login as the normal user
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: { email: testEmail, password: "password123" },
    });
    const normalToken = (await loginRes.json()).access_token;

    // Try to query a site the user DOES NOT have access to
    const res = await request.get("http://localhost:8081/api/v1/analytics/overview", {
      headers: { Authorization: `Bearer ${normalToken}` },
      params: { site_id: "example-traditional-mpa", range: "24h" },
    });
    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("You do not have access to this site");
  });

  // Test 7: Privilege Escalation (Granular Permissions)
  test("should reject querying realtime endpoints without read:realtime permission (403 Forbidden)", async ({
    request,
  }) => {
    // Create a normal user with ONLY read:analytics permission on 'example-next-js'
    const testUsername = `rbac_realtime_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    
    await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${jwtToken}` },
      data: {
        username: testUsername,
        nickname: "RBAC Realtime User",
        email: testEmail,
        password: "password123",
        is_superuser: false,
        sites: [
          {
            site_id: "example-next-js",
            permissions: [{ effect: "allow", actions: ["read:analytics"] }], // No read:realtime
          },
        ],
      },
    });

    // Login as the normal user
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: { email: testEmail, password: "password123" },
    });
    const normalToken = (await loginRes.json()).access_token;

    // Try to query recent_sessions which requires read:realtime
    const res = await request.get("http://localhost:8081/api/v1/analytics/recent_sessions", {
      headers: { Authorization: `Bearer ${normalToken}` },
      params: { site_id: "example-next-js" },
    });
    expect(res.status()).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("You do not have permission for this action on this site");
  });

  // Test 8: API Brute-Force Rate Limiting
  test("should enforce rate limiting on /login endpoint (429 Too Many Requests)", async ({
    request,
  }, testInfo) => {
    // We use a fake random IP to avoid poisoning the rate limiter for other tests running on localhost
    // and across parallel browser workers (Chromium, Firefox, Webkit)
    const fakeIp = uniqueForwardedIp(testInfo, "limit");
    const headers = { "X-Forwarded-For": fakeIp };

    // Send 5 incorrect password attempts (the limit is 5 per minute)
    for (let i = 0; i < 5; i++) {
      const res = await request.post("http://localhost:8081/api/v1/auth/login", {
        headers,
        data: { email: "admin@cyanly.local", password: "wrong-password-brute-force" },
      });
      // Should be 401 Unauthorized, unless rate limited (429)
      expect(res.status()).toBe(401);
    }

    // The 6th attempt should hit the rate limit
    const resRateLimited = await request.post("http://localhost:8081/api/v1/auth/login", {
      headers,
      data: { email: "admin@cyanly.local", password: "wrong-password-brute-force" },
    });
    expect(resRateLimited.status()).toBe(429);
    const dataRateLimited = await resRateLimited.json();
    expect(dataRateLimited.error).toContain("Too many login attempts");
  });

  test("should clear login rate limit after a successful login", async ({
    request,
  }, testInfo) => {
    const fakeIp = uniqueForwardedIp(testInfo, "reset");
    const headers = { "X-Forwarded-For": fakeIp };

    for (let i = 0; i < 4; i++) {
      const res = await request.post("http://localhost:8081/api/v1/auth/login", {
        headers,
        data: { email: "admin@cyanly.local", password: "wrong-password-before-reset" },
      });
      expect(res.status()).toBe(401);
    }

    const successRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      headers,
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(successRes.status()).toBe(200);

    for (let i = 0; i < 5; i++) {
      const res = await request.post("http://localhost:8081/api/v1/auth/login", {
        headers,
        data: { email: "admin@cyanly.local", password: "wrong-password-after-reset" },
      });
      expect(res.status()).toBe(401);
    }

    const rateLimitedRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      headers,
      data: { email: "admin@cyanly.local", password: "wrong-password-after-reset" },
    });
    expect(rateLimitedRes.status()).toBe(429);
  });

  test("should keep login rate limits isolated by client IP", async ({
    request,
  }, testInfo) => {
    const blockedHeaders = { "X-Forwarded-For": uniqueForwardedIp(testInfo, "blocked") };
    const allowedHeaders = { "X-Forwarded-For": uniqueForwardedIp(testInfo, "allowed") };

    for (let i = 0; i < 5; i++) {
      const res = await request.post("http://localhost:8081/api/v1/auth/login", {
        headers: blockedHeaders,
        data: { email: "admin@cyanly.local", password: "wrong-password-blocked-ip" },
      });
      expect(res.status()).toBe(401);
    }

    const blockedRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      headers: blockedHeaders,
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(blockedRes.status()).toBe(429);

    const allowedRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      headers: allowedHeaders,
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(allowedRes.status()).toBe(200);
  });

  // Test 9: Extended SQL Injection Surfaces
  test("should handle SQL injection payloads in user_agent, event_name, and properties gracefully", async ({
    request,
  }) => {
    const sqlPayload = "' OR 1=1; DROP TABLE events; --";

    // Fetch a token first
    const tokenResponse = await request.get(
      "http://localhost:13001/api/cyanly-token?sessionId=s-sql-extended",
    );
    expect(tokenResponse.status()).toBe(200);
    const { token } = await tokenResponse.json();

    const collectResponse = await request.post(
      "http://localhost:8080/collect",
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": sqlPayload, // Inject in UA
        },
        data: {
          site_id: "example-next-js",
          visitor_id: "v-sql-extended",
          session_id: "s-sql-extended",
          event_name: sqlPayload, // Inject in event_name
          properties: JSON.stringify({ malicious_key: sqlPayload }), // Inject in properties
          url: "http://localhost:13001/sql-extended",
          title: "SQL Extended Test",
          token: token,
        },
      },
    );
    // As long as the payload validates the structural rules (length, JSON), it is accepted.
    expect(collectResponse.status()).toBe(200);

    // Wait for worker to flush
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify system is still functional and DB is intact by fetching overview
    const apiResponse = await request.get(
      "http://localhost:8081/api/v1/analytics/overview",
      {
        headers: { Authorization: `Bearer ${jwtToken}` },
        params: { site_id: "example-next-js", range: "24h" },
      },
    );
    expect(apiResponse.status()).toBe(200);
  });

  // Test 10: Stored XSS Prevention
  test("should store and return XSS payloads as literal strings without executing", async ({
    request,
  }) => {
    const xssPayload = "<script>alert('xss-stored')</script>";

    // Fetch token
    const tokenResponse = await request.get(
      "http://localhost:13001/api/cyanly-token?sessionId=s-xss-stored",
    );
    const { token } = await tokenResponse.json();

    const collectResponse = await request.post(
      "http://localhost:8080/collect",
      {
        headers: { "Content-Type": "application/json" },
        data: {
          site_id: "example-next-js",
          visitor_id: "v-xss-stored",
          session_id: "s-xss-stored",
          url: `http://localhost:13001/${xssPayload}`,
          title: xssPayload,
          token: token,
        },
      },
    );
    expect(collectResponse.status()).toBe(200);

    // Wait for flush
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Query recent sessions and ensure payload is returned safely
    const apiResponse = await request.get(
      "http://localhost:8081/api/v1/analytics/recent_sessions",
      {
        headers: { Authorization: `Bearer ${jwtToken}` },
        params: { site_id: "example-next-js" },
      },
    );
    expect(apiResponse.status()).toBe(200);
    const sessions = (await apiResponse.json()) as RecentSession[];

    const xssSession = sessions.find((s) => s.visitor_id === "v-xss-stored");
    expect(xssSession).toBeDefined();
    if (xssSession === undefined) {
      throw new Error("Stored XSS test session was not found");
    }
    expect(xssSession.actions[0].url).toContain(xssPayload);
    expect(xssSession.actions[0].title).toBe(xssPayload);
  });

  // Test 11: Event Cardinality Limits
  test("should reject custom events with oversized names or control characters to prevent cardinality DoS", async ({
    request,
  }) => {
    // A: Oversized event name (>64 chars)
    const longName = "A".repeat(100);
    const resA = await request.post("http://localhost:8080/collect", {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: "example-next-js",
        visitor_id: "v-card-1",
        session_id: "s-card-1",
        event_name: longName,
        url: "http://localhost:13001/test",
      },
    });
    // Collector validates this before JWKS, so 400 Bad Request
    expect(resA.status()).toBe(400);
    expect((await resA.json()).error).toBe("invalid event_name");

    // B: Control characters in event name
    const ctrlName = "page\nview";
    const resB = await request.post("http://localhost:8080/collect", {
      headers: { "Content-Type": "application/json" },
      data: {
        site_id: "example-next-js",
        visitor_id: "v-card-2",
        session_id: "s-card-2",
        event_name: ctrlName,
        url: "http://localhost:13001/test",
      },
    });
    expect(resB.status()).toBe(400);
    expect((await resB.json()).error).toBe("invalid event_name");
  });
});
