import { test, expect } from "@playwright/test";

// Shared constants
const API_BASE = "http://localhost:8081/api/v1/analytics";
const AUTH_HEADERS = {
  Authorization: "",
};
const SITE_ID = "example-next-js";

test.beforeEach(async ({ request }) => {
  const res = await request.post("http://localhost:8081/api/v1/auth/login", {
    data: {
      email: "admin@cyanly.local",
      password: "cyanly-admin-secure-password",
    },
  });
  if (!res.ok()) {
    throw new Error("Failed to login E2E test user");
  }
  const data = await res.json();
  AUTH_HEADERS.Authorization = `Bearer ${data.access_token}`;
});

test.describe("Query API Endpoints Data Validation", () => {
  // Run data validation tests serially — the first test acts as a gate
  // that waits for cyanly.spec.ts to ingest events before proceeding.
  test.describe.configure({ mode: "serial" });

  test("should wait for event data to be available in ClickHouse", async ({
    request,
  }) => {
    // Poll the overview API until events from cyanly.spec.ts are flushed
    // through Redis → Worker → ClickHouse. This runs in parallel with
    // the cyanly.spec.ts telemetry test, so we need a generous timeout.
    let pageviews = 0;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await request.get(`${API_BASE}/overview`, {
          headers: AUTH_HEADERS,
          params: { site_id: SITE_ID },
        });
        if (res.status() === 200) {
          const data = await res.json();
          pageviews = data.pageviews || 0;
          if (pageviews >= 3) break;
        }
      } catch {
        // Retry
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    expect(pageviews).toBeGreaterThanOrEqual(3);
    console.log(`[Gate] Data ready: ${pageviews} pageviews`);
  });

  test("should return valid overview data with all expected fields", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/overview`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();

    // Assert all 5 fields exist and have correct types
    expect(data.pageviews).toBeGreaterThanOrEqual(3);
    expect(data.visitors).toBeGreaterThanOrEqual(1);
    expect(data.sessions).toBeGreaterThanOrEqual(1);
    expect(typeof data.average_duration).toBe("number");
    expect(Number.isFinite(data.average_duration)).toBe(true);
    // average_duration is milliseconds. Real SDK pageviews dwell >1000ms, but
    // this is an AVERAGE and security.spec.ts posts zero-duration events directly
    // to /collect (bypassing the SDK ignore filter), which drag the mean down.
    // A 1000x regression (back to seconds, or a dropped *1000) would collapse it
    // to single digits, so >= 100 catches that decisively while tolerating
    // zero-duration dilution.
    expect(data.average_duration).toBeGreaterThanOrEqual(100);
    expect(typeof data.bounce_rate).toBe("number");
    expect(data.bounce_rate).toBeGreaterThanOrEqual(0);
    expect(data.bounce_rate).toBeLessThanOrEqual(100);

    console.log("[Overview]", JSON.stringify(data));
  });

  test("should return valid pages data with URL and title", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/pages`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const pages: any[] = await res.json();

    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);

    // Validate structure of each page item
    for (const page of pages) {
      expect(typeof page.url).toBe("string");
      expect(page.url.length).toBeGreaterThan(0);
      expect(typeof page.title).toBe("string");
      expect(typeof page.pageviews).toBe("number");
      expect(page.pageviews).toBeGreaterThan(0);
      expect(typeof page.visitors).toBe("number");
      expect(page.visitors).toBeGreaterThan(0);
      expect(typeof page.average_duration).toBe("number");
      expect(page.average_duration).toBeGreaterThanOrEqual(0);
    }

    // Pages should be ordered by pageviews DESC
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i - 1].pageviews).toBeGreaterThanOrEqual(pages[i].pageviews);
    }

    console.log(`[Pages] ${pages.length} pages returned`);
  });

  test("should return valid sources data with referrers and utm arrays", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/sources`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();

    // Validate top-level structure
    expect(Array.isArray(data.referrers)).toBe(true);
    expect(Array.isArray(data.utm)).toBe(true);

    // Referrers should be non-empty (at minimum "Direct / None")
    expect(data.referrers.length).toBeGreaterThan(0);

    // Validate referrer items structure
    for (const ref of data.referrers) {
      expect(typeof ref.source).toBe("string");
      expect(ref.source.length).toBeGreaterThan(0);
      expect(typeof ref.pageviews).toBe("number");
      expect(typeof ref.visitors).toBe("number");
    }

    // Check "Direct / None" entry exists (all test events have no external referrer)
    const directEntry = data.referrers.find(
      (r: any) => r.source === "Direct / None",
    );
    expect(directEntry).toBeDefined();

    // UTM is expected to be empty (test events don't carry UTM params)
    // but validate structure if items exist
    for (const utm of data.utm) {
      expect(typeof utm.source).toBe("string");
      expect(typeof utm.medium).toBe("string");
      expect(typeof utm.campaign).toBe("string");
      expect(typeof utm.pageviews).toBe("number");
      expect(typeof utm.visitors).toBe("number");
    }

    console.log(
      `[Sources] ${data.referrers.length} referrers, ${data.utm.length} UTM entries`,
    );
  });

  test("should return valid devices breakdown with all 4 categories", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/devices`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();

    // All 4 categories must be arrays
    expect(Array.isArray(data.device_types)).toBe(true);
    expect(Array.isArray(data.operating_systems)).toBe(true);
    expect(Array.isArray(data.browsers)).toBe(true);
    expect(Array.isArray(data.countries)).toBe(true);

    // Browsers should be non-empty (Playwright browser generates events)
    expect(data.browsers.length).toBeGreaterThan(0);

    // Validate CountItem structure for all categories
    const allCategories = [
      ...data.device_types,
      ...data.operating_systems,
      ...data.browsers,
      ...data.countries,
    ];
    for (const item of allCategories) {
      expect(typeof item.name).toBe("string");
      expect(typeof item.count).toBe("number");
      expect(item.count).toBeGreaterThan(0);
    }

    console.log(
      `[Devices] types=${data.device_types.length}, os=${data.operating_systems.length}, browsers=${data.browsers.length}, countries=${data.countries.length}`,
    );
  });

  test("should return valid time series data with timestamp buckets", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/time_series`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const series: any[] = await res.json();

    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);

    // Validate each time series item
    for (const item of series) {
      expect(typeof item.timestamp).toBe("string");
      expect(item.timestamp.length).toBeGreaterThan(0);
      expect(typeof item.pageviews).toBe("number");
      expect(item.pageviews).toBeGreaterThan(0);
      expect(typeof item.visitors).toBe("number");
      expect(item.visitors).toBeGreaterThan(0);
    }

    // Default range is 24h → should use hourly granularity (format: "YYYY-MM-DD HH:00:00")
    expect(series[0].timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );

    console.log(`[TimeSeries] ${series.length} buckets`);
  });

  test("should return valid recent sessions with navigation actions", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/recent_sessions`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(200);
    const sessions: any[] = await res.json();

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);

    // Validate the first session's structure
    const session = sessions[0];
    expect(typeof session.session_id).toBe("string");
    expect(session.session_id.length).toBeGreaterThan(0);
    expect(typeof session.visitor_id).toBe("string");
    expect(session.visitor_id.length).toBeGreaterThan(0);
    expect(typeof session.start_time).toBe("string");
    expect(typeof session.end_time).toBe("string");
    expect(typeof session.total_duration_ms).toBe("number");
    expect(typeof session.browser_name).toBe("string");
    expect(typeof session.os_name).toBe("string");
    expect(typeof session.device_type).toBe("string");
    expect(typeof session.is_returning).toBe("boolean");
    expect(typeof session.screen_width).toBe("number");
    expect(typeof session.screen_height).toBe("number");

    // Actions array must be non-empty
    expect(Array.isArray(session.actions)).toBe(true);
    expect(session.actions.length).toBeGreaterThan(0);

    // Validate action structure
    const action = session.actions[0];
    expect(typeof action.url).toBe("string");
    expect(typeof action.title).toBe("string");
    expect(typeof action.timestamp).toBe("string");
    expect(typeof action.duration_ms).toBe("number");

    // duration_ms is in MILLISECONDS. We cannot assert a positive lower bound on
    // any single session/action: security.spec.ts posts directly to /collect
    // (bypassing the SDK ignore filter) with no duration_ms, producing legitimate
    // duration_ms = 0 pageviews that can sort first by last_active. Instead assert
    // the ms-scale on the MAX across all sessions/actions — real SDK pageviews
    // dwell >1000ms, so a seconds-regression (or a dropped *1000) would collapse
    // the max to single digits and fail this bound.
    let maxDurationMs = 0;
    for (const s of sessions) {
      if (typeof s.total_duration_ms === "number") {
        maxDurationMs = Math.max(maxDurationMs, s.total_duration_ms);
      }
      for (const a of s.actions || []) {
        if (typeof a.duration_ms === "number") {
          maxDurationMs = Math.max(maxDurationMs, a.duration_ms);
        }
      }
    }
    expect(maxDurationMs).toBeGreaterThanOrEqual(500);

    console.log(
      `[RecentSessions] ${sessions.length} sessions, first has ${session.actions.length} actions, maxDurationMs=${maxDurationMs}`,
    );
  });

  test("should return valid visitor profile from recent session data", async ({
    request,
  }) => {
    // Step 1: Get a visitor_id from recent sessions
    const sessionsRes = await request.get(`${API_BASE}/recent_sessions`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });
    expect(sessionsRes.status()).toBe(200);
    const sessions: any[] = await sessionsRes.json();
    expect(sessions.length).toBeGreaterThan(0);

    const visitorId = sessions[0].visitor_id;

    // Step 2: Query visitor profile
    const res = await request.get(`${API_BASE}/visitor`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID, visitor_id: visitorId },
    });

    expect(res.status()).toBe(200);
    const profile = await res.json();

    // Validate structure
    expect(profile.visitor_id).toBe(visitorId);
    expect(typeof profile.total_sessions).toBe("number");
    expect(profile.total_sessions).toBeGreaterThanOrEqual(1);
    expect(typeof profile.first_visit).toBe("string");
    expect(typeof profile.last_visit).toBe("string");
    expect(Array.isArray(profile.devices)).toBe(true);
    expect(Array.isArray(profile.operating_systems)).toBe(true);
    expect(Array.isArray(profile.browsers)).toBe(true);
    expect(Array.isArray(profile.countries)).toBe(true);

    // At least one browser should be present
    expect(profile.browsers.length).toBeGreaterThan(0);

    console.log(
      `[Visitor] visitor=${visitorId}, sessions=${profile.total_sessions}, browsers=${profile.browsers}`,
    );
  });
});

test.describe("Query API Parameter Validation", () => {
  // Endpoints using parseTimeParams (require site_id)
  const endpointsWithSiteIdParam = [
    { name: "overview", path: "/overview" },
    { name: "pages", path: "/pages" },
    { name: "sources", path: "/sources" },
    { name: "devices", path: "/devices" },
    { name: "time_series", path: "/time_series" },
  ];

  for (const ep of endpointsWithSiteIdParam) {
    test(`should reject ${ep.name} request without site_id (400)`, async ({
      request,
    }) => {
      const res = await request.get(`${API_BASE}${ep.path}`, {
        headers: AUTH_HEADERS,
      });

      expect(res.status()).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("site_id parameter is required");
    });
  }

  test("should reject recent_sessions request without site_id (400)", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/recent_sessions`, {
      headers: AUTH_HEADERS,
    });

    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("site_id is required");
  });

  test("should reject visitor request without visitor_id (400)", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/visitor`, {
      headers: AUTH_HEADERS,
      params: { site_id: SITE_ID },
    });

    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("site_id and visitor_id are required");
  });

  test("should reject visitor request without site_id (400)", async ({
    request,
  }) => {
    const res = await request.get(`${API_BASE}/visitor`, {
      headers: AUTH_HEADERS,
      params: { visitor_id: "some-visitor" },
    });

    expect(res.status()).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("site_id and visitor_id are required");
  });
});
