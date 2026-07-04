import { test, expect } from "@playwright/test";

// Set a timeout for the entire test suite run (each test can take up to 30s)
test.describe("Chiyo Analytics E2E Test Suite", () => {
  test("should track actions on Next.js example, Vite example, and Web example, then report in API and Dashboard", async ({
    page,
    request,
  }) => {
    // Obtain valid JWT for tests
    const loginRes = await request.post(
      "http://localhost:8081/api/v1/auth/login",
      {
        data: {
          email: "admin@cyanly.local",
          password: "cyanly-admin-secure-password",
        },
      },
    );
    expect(loginRes.status()).toBe(200);
    const loginData = await loginRes.json();
    const jwtToken = loginData.access_token;
    const refreshToken = loginData.refresh_token;

    console.log("--- Step 1: Visiting Next.js Example (localhost:13001) ---");
    await page.goto("http://localhost:13001/en");
    await expect(page).toHaveTitle(/Chiyo Store/);

    // Navigate to products
    await page.click("text=Products");
    await expect(page).toHaveURL(/.*products/);

    // Click on a product detail page
    await page.locator('a[href*="/products/"]').first().click();
    await expect(page).toHaveURL(/.*products\/.+/);
    await page.waitForTimeout(1500); // Simulate reading page for duration tracking

    console.log(
      "--- Step 2: Visiting Vite React Router Example (localhost:13002) ---",
    );
    await page.goto("http://localhost:13002/");
    // Navigate to products
    const productsLink = page
      .locator("nav a, header a")
      .filter({ hasText: "Products" })
      .first();
    await productsLink.click();
    await expect(page).toHaveURL(/.*products/);

    // Click on a product detail card
    await page.locator('a[href*="/products/"]').first().click();
    await expect(page).toHaveURL(/.*products\/.+/);
    await page.waitForTimeout(1500); // Simulate reading page for duration tracking

    console.log(
      "--- Step 3: Visiting Web (HTML/JS) Example (localhost:13003) ---",
    );
    await page.goto("http://localhost:13003/index.html");
    await page.waitForTimeout(1100); // Wait to exceed ignore duration (1s)
    await page.click("text=Products");
    await expect(page).toHaveURL(/.*products\.html/);
    await page.waitForTimeout(1100); // Wait to exceed ignore duration (1s)

    // Click on a product detail card
    await page.locator('a[href*="product.html?id="]').first().click();
    await expect(page).toHaveURL(/.*product\.html\?id=.+/);
    await page.waitForTimeout(1500); // Simulate reading page for duration tracking

    // Navigate to about:blank to trigger pagehide and flush the last event
    await page.goto("about:blank");

    console.log("--- Step 4: Waiting for background processing to finish ---");
    // Events are buffered in Redis, Go Worker consumes and batches them to ClickHouse.
    // Wait up to 15 seconds, polling the Query API until stats are loaded for all examples
    let nextjsOk = false;
    let viteOk = false;
    let mpaOk = false;

    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      try {
        if (!nextjsOk) {
          const res = await request.get(
            "http://localhost:8081/api/v1/analytics/overview",
            {
              headers: { Authorization: `Bearer ${jwtToken}` },
              params: { site_id: "example-next-js", range: "24h" },
            },
          );
          if (res.status() === 200) {
            const data = await res.json();
            if ((data.pageviews || 0) >= 1) nextjsOk = true;
          }
        }
        if (!viteOk) {
          const res = await request.get(
            "http://localhost:8081/api/v1/analytics/overview",
            {
              headers: { Authorization: `Bearer ${jwtToken}` },
              params: { site_id: "example-vite-react-router", range: "24h" },
            },
          );
          if (res.status() === 200) {
            const data = await res.json();
            if ((data.pageviews || 0) >= 1) viteOk = true;
          }
        }
        if (!mpaOk) {
          const res = await request.get(
            "http://localhost:8081/api/v1/analytics/overview",
            {
              headers: { Authorization: `Bearer ${jwtToken}` },
              params: { site_id: "example-traditional-mpa", range: "24h" },
            },
          );
          if (res.status() === 200) {
            const data = await res.json();
            if ((data.pageviews || 0) >= 1) mpaOk = true;
          }
        }

        console.log(
          `[API Poll] nextjsOk: ${nextjsOk}, viteOk: ${viteOk}, mpaOk: ${mpaOk}`,
        );
        if (nextjsOk && viteOk && mpaOk) {
          break;
        }
      } catch (err: any) {
        console.log(`[API Poll] Error fetching overview API: ${err.message}`);
      }
    }

    expect(nextjsOk).toBe(true);
    expect(viteOk).toBe(true);
    expect(mpaOk).toBe(true);

    console.log(
      "--- Step 5: Verifying Chiyo Analytics Dashboard Interface (localhost:8079) ---",
    );
    // Go to login page first to establish origin context
    await page.goto("http://localhost:8079/en/login");
    // Set localStorage credentials
    await page.evaluate(
      ({ token, refresh }) => {
        localStorage.setItem("cyanly_access_token", token);
        localStorage.setItem("cyanly_refresh_token", refresh);
      },
      { token: jwtToken, refresh: refreshToken },
    );

    // Navigate to dashboard homepage
    await page.goto("http://localhost:8079/en?site_id=example-next-js");

    // Ensure dashboard loads and contains the site selector or page view cards
    await expect(page.locator("body")).toContainText(
      /Chiyo Analytics|Unique Visitors/i,
    );

    console.log("--- E2E Test Completed Successfully! ---");
  });

  // #5 — SDK proactively refreshes the secure token before it expires.
  // The MPA SDK fetches a 120s token on load and schedules a refresh at
  // ~80% of its lifetime (delay = ttl - min(5min, ttl*0.2) = 96s). We freeze
  // time with page.clock so we can fast-forward past that point and assert a
  // second token fetch happens without waiting 96 real seconds.
  test("MPA SDK should proactively refresh the secure token before expiry", async ({
    page,
  }) => {
    // Count requests hitting the token endpoint.
    let tokenFetches = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/cyanly-token")) {
        tokenFetches++;
      }
    });

    // Install a fake clock so setTimeout-based refresh can be driven manually.
    // Real network fetches are unaffected by the fake clock.
    await page.clock.install();

    await page.goto("http://localhost:13003/index.html");

    // The SDK fetches the initial token on load.
    await expect.poll(() => tokenFetches, { timeout: 10000 }).toBe(1);

    // Let the in-flight token response resolve so the SDK registers its
    // setTimeout-based refresh timer. page.waitForTimeout runs on real wall
    // time and does NOT advance the browser's fake clock, so the 96s refresh
    // timer cannot fire prematurely here.
    await page.waitForTimeout(1000);

    // Fast-forward past the 96s refresh point (token TTL is 120s).
    await page.clock.fastForward(110_000);

    // The scheduled refresh timer should now have fired a second fetch.
    await expect
      .poll(() => tokenFetches, { timeout: 10000 })
      .toBeGreaterThanOrEqual(2);

    console.log(
      `--- Proactive Refresh verified: token fetched ${tokenFetches} times ---`,
    );
  });

  // Stable replacement for the removed sendBeacon-capture assertion.
  // We patch navigator.sendBeacon via addInitScript (runs before the SDK loads)
  // and read the Blob payload at the source. This is reliable cross-browser —
  // unlike page.on("request").postData(), which returns null for Blob beacons in
  // chromium/webkit. We trigger the flush with an in-page SPA route change so the
  // pageview reports while the page is still alive (no pagehide timing race).
  test("pageview beacon reports the event-driven payload shape", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // Authored in the Node-typed test context but runs in the browser, so we
      // avoid DOM lib types (window/Navigator/Blob/BodyInit) and duck-type the
      // Blob payload instead.
      const g = globalThis as unknown as {
        __cyanlyBeacons: unknown[];
        navigator: {
          sendBeacon: (url: string, data?: unknown) => boolean;
        };
      };
      g.__cyanlyBeacons = [];
      const original = g.navigator.sendBeacon.bind(g.navigator);
      g.navigator.sendBeacon = (url: string, data?: unknown) => {
        try {
          const maybeBlob = data as { text?: () => Promise<string> } | null;
          if (maybeBlob && typeof maybeBlob.text === "function") {
            maybeBlob.text().then((text) => {
              try {
                g.__cyanlyBeacons.push(JSON.parse(text));
              } catch {
                // Non-JSON beacon; ignore.
              }
            });
          } else if (typeof data === "string") {
            g.__cyanlyBeacons.push(JSON.parse(data));
          }
        } catch {
          // Capture failure must not break the real beacon.
        }
        return original(url, data);
      };
    });

    await page.goto("http://localhost:13002/");
    // Dwell past the example's reporterIgnoreMs (1000ms) so the pageview is not
    // filtered out as an accidental visit.
    await page.waitForTimeout(1300);

    // Client-side route change flushes the home pageview via sendBeacon.
    const productsLink = page
      .locator("nav a, header a")
      .filter({ hasText: "Products" })
      .first();
    await productsLink.click();
    await expect(page).toHaveURL(/.*products/);

    // Read captured beacons back from the page.
    const readBeacons = () =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __cyanlyBeacons: unknown[] })
            .__cyanlyBeacons,
      );
    await expect
      .poll(async () => (await readBeacons()).length, { timeout: 10000 })
      .toBeGreaterThan(0);

    const beacons = (await readBeacons()) as Array<Record<string, unknown>>;
    const pageview = beacons.find((b) => b.event_name === "pageview");
    expect(pageview, "expected a pageview beacon").toBeDefined();
    const pv = pageview as Record<string, unknown>;

    // Event-driven shape: event_name + properties are present.
    expect(pv.event_name).toBe("pageview");
    expect(typeof pv.properties).toBe("string");
    expect(pv.properties).toBe("");

    // duration_ms replaces the old `duration` field and is in MILLISECONDS.
    expect("duration" in pv).toBe(false);
    expect(typeof pv.duration_ms).toBe("number");
    expect(pv.duration_ms as number).toBeGreaterThanOrEqual(1000);

    // Identity + context fields still carried.
    expect(typeof pv.site_id).toBe("string");
    expect((pv.site_id as string).length).toBeGreaterThan(0);
    expect(typeof pv.visitor_id).toBe("string");
    expect((pv.visitor_id as string).length).toBeGreaterThan(0);
    expect(typeof pv.session_id).toBe("string");
    expect((pv.session_id as string).length).toBeGreaterThan(0);
    expect(typeof pv.url).toBe("string");

    console.log(
      `[Beacon] pageview captured: duration_ms=${pv.duration_ms}, url=${pv.url}`,
    );
  });

  // Custom event — data link: clicking add-to-cart fires trackEvent("add_to_cart")
  // via the SDK, which flows through collector → Redis → worker → ClickHouse and
  // surfaces on the new GET /events query API. The Vite example uses programmatic
  // trackEvent and a secure token (JWKS), so we wait for the token fetch before
  // clicking, otherwise the collector rejects the event with 403.
  test("add_to_cart custom event reaches the /events query API", async ({
    page,
    request,
  }) => {
    const loginRes = await request.post(
      "http://localhost:8081/api/v1/auth/login",
      {
        data: {
          email: "admin@cyanly.local",
          password: "cyanly-admin-secure-password",
        },
      },
    );
    expect(loginRes.status()).toBe(200);
    const jwtToken = (await loginRes.json()).access_token;

    // Navigate straight to a product detail page (full load → fresh SDK init).
    const tokenFetch = page.waitForResponse((res) =>
      res.url().includes("/api/cyanly-token"),
    );
    await page.goto("http://localhost:13002/products/vr-headset");
    // The secure token must resolve before trackEvent, or /collect returns 403.
    await tokenFetch;

    await page.locator(".add-to-cart-btn").click();

    // Poll the /events API until the add_to_cart event is flushed to ClickHouse.
    let addToCart: { name: string; count: number; visitors: number } | undefined;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const res = await request.get(
        "http://localhost:8081/api/v1/analytics/events",
        {
          headers: { Authorization: `Bearer ${jwtToken}` },
          params: { site_id: "example-vite-react-router", range: "24h" },
        },
      );
      if (res.status() === 200) {
        const events: Array<{ name: string; count: number; visitors: number }> =
          await res.json();
        addToCart = events.find((e) => e.name === "add_to_cart");
        if (addToCart && addToCart.count >= 1) break;
      }
    }

    expect(addToCart, "expected add_to_cart in /events response").toBeDefined();
    expect(addToCart!.count).toBeGreaterThanOrEqual(1);
    expect(addToCart!.visitors).toBeGreaterThanOrEqual(1);

    console.log(
      `[CustomEvent] add_to_cart count=${addToCart!.count}, visitors=${addToCart!.visitors}`,
    );
  });

  // Custom event — beacon shape: assert the add_to_cart payload carries the
  // event-driven fields. Mirrors the pageview beacon test: capture sendBeacon at
  // the source via addInitScript (reliable cross-browser for Blob payloads).
  test("add_to_cart beacon reports the custom-event payload shape", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const g = globalThis as unknown as {
        __cyanlyBeacons: unknown[];
        navigator: {
          sendBeacon: (url: string, data?: unknown) => boolean;
        };
      };
      g.__cyanlyBeacons = [];
      const original = g.navigator.sendBeacon.bind(g.navigator);
      g.navigator.sendBeacon = (url: string, data?: unknown) => {
        try {
          const maybeBlob = data as { text?: () => Promise<string> } | null;
          if (maybeBlob && typeof maybeBlob.text === "function") {
            maybeBlob.text().then((text) => {
              try {
                g.__cyanlyBeacons.push(JSON.parse(text));
              } catch {
                // Non-JSON beacon; ignore.
              }
            });
          } else if (typeof data === "string") {
            g.__cyanlyBeacons.push(JSON.parse(data));
          }
        } catch {
          // Capture failure must not break the real beacon.
        }
        return original(url, data);
      };
    });

    const tokenFetch = page.waitForResponse((res) =>
      res.url().includes("/api/cyanly-token"),
    );
    await page.goto("http://localhost:13002/products/vr-headset");
    await tokenFetch;

    await page.locator(".add-to-cart-btn").click();

    const readBeacons = () =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __cyanlyBeacons: unknown[] })
            .__cyanlyBeacons,
      );
    await expect
      .poll(
        async () =>
          ((await readBeacons()) as Array<Record<string, unknown>>).filter(
            (b) => b.event_name === "add_to_cart",
          ).length,
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);

    const beacons = (await readBeacons()) as Array<Record<string, unknown>>;
    const evt = beacons.find((b) => b.event_name === "add_to_cart");
    expect(evt, "expected an add_to_cart beacon").toBeDefined();
    const ev = evt as Record<string, unknown>;

    // Custom-event shape.
    expect(ev.event_name).toBe("add_to_cart");
    expect("duration" in ev).toBe(false);
    expect(typeof ev.duration_ms).toBe("number");
    expect(ev.duration_ms).toBe(0);

    // properties is a non-empty JSON string carrying the declared fields.
    expect(typeof ev.properties).toBe("string");
    expect((ev.properties as string).length).toBeGreaterThan(0);
    const props = JSON.parse(ev.properties as string) as Record<string, unknown>;
    expect(typeof props.product_id).toBe("string");
    expect(typeof props.product_name).toBe("string");
    expect(typeof props.price).toBe("number");

    console.log(
      `[CustomEvent] add_to_cart beacon: properties=${ev.properties}`,
    );
  });

  // Declarative props merge/override: the Next.js example sets product_name to
  // "will-be-override" in data-cyanly-props (JSON) and overrides it via the
  // data-cyanly-prop-product-name shorthand. We assert the shorthand wins,
  // proving both the snake_case shorthand parsing and the merge precedence.
  test("declarative data-cyanly-prop shorthand overrides data-cyanly-props", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const g = globalThis as unknown as {
        __cyanlyBeacons: unknown[];
        navigator: {
          sendBeacon: (url: string, data?: unknown) => boolean;
        };
      };
      g.__cyanlyBeacons = [];
      const original = g.navigator.sendBeacon.bind(g.navigator);
      g.navigator.sendBeacon = (url: string, data?: unknown) => {
        try {
          const maybeBlob = data as { text?: () => Promise<string> } | null;
          if (maybeBlob && typeof maybeBlob.text === "function") {
            maybeBlob.text().then((text) => {
              try {
                g.__cyanlyBeacons.push(JSON.parse(text));
              } catch {
                // Non-JSON beacon; ignore.
              }
            });
          } else if (typeof data === "string") {
            g.__cyanlyBeacons.push(JSON.parse(data));
          }
        } catch {
          // Capture failure must not break the real beacon.
        }
        return original(url, data);
      };
    });

    const tokenFetch = page.waitForResponse((res) =>
      res.url().includes("/api/cyanly-token"),
    );
    await page.goto("http://localhost:13001/en/products/vr-headset");
    await tokenFetch;

    await page.locator(".add-to-cart-btn, button:has-text('cart')").first().click();

    const readBeacons = () =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __cyanlyBeacons: unknown[] })
            .__cyanlyBeacons,
      );
    await expect
      .poll(
        async () =>
          ((await readBeacons()) as Array<Record<string, unknown>>).filter(
            (b) => b.event_name === "add_to_cart",
          ).length,
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);

    const beacons = (await readBeacons()) as Array<Record<string, unknown>>;
    const evt = beacons.find((b) => b.event_name === "add_to_cart");
    expect(evt, "expected an add_to_cart beacon").toBeDefined();
    const props = JSON.parse(
      (evt as Record<string, unknown>).properties as string,
    ) as Record<string, unknown>;

    // The JSON base set product_name to the placeholder; the shorthand
    // (data-cyanly-prop-product-name = product.name) must override it.
    expect(props.product_name).toBe("Chiyo Spatial VR Headset");
    expect(props.product_name).not.toBe("will-be-override");
    // product_id comes only from the JSON base and is preserved.
    expect(props.product_id).toBe("vr-headset");

    console.log(
      `[CustomEvent] merge/override verified: product_name=${props.product_name}`,
    );
  });

  // Shorthand magic-string coercion: the Web MPA example sends price via
  // data-cyanly-prop-price="...::<number>". We assert it arrives as a real
  // number (a plain string "899" would fail), while the un-annotated id/name
  // stay strings. This exercises the all-shorthand declarative path on MPA.
  test("data-cyanly-prop magic string coerces value types", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const g = globalThis as unknown as {
        __cyanlyBeacons: unknown[];
        navigator: {
          sendBeacon: (url: string, data?: unknown) => boolean;
        };
      };
      g.__cyanlyBeacons = [];
      const original = g.navigator.sendBeacon.bind(g.navigator);
      g.navigator.sendBeacon = (url: string, data?: unknown) => {
        try {
          const maybeBlob = data as { text?: () => Promise<string> } | null;
          if (maybeBlob && typeof maybeBlob.text === "function") {
            maybeBlob.text().then((text) => {
              try {
                g.__cyanlyBeacons.push(JSON.parse(text));
              } catch {
                // Non-JSON beacon; ignore.
              }
            });
          } else if (typeof data === "string") {
            g.__cyanlyBeacons.push(JSON.parse(data));
          }
        } catch {
          // Capture failure must not break the real beacon.
        }
        return original(url, data);
      };
    });

    // MPA fetches the secure token on load before wiring the click listener.
    const tokenFetch = page.waitForResponse((res) =>
      res.url().includes("/api/cyanly-token"),
    );
    await page.goto("http://localhost:13003/product.html?id=vr-headset");
    await tokenFetch;

    await page.locator(".add-to-cart-btn").click();

    const readBeacons = () =>
      page.evaluate(
        () =>
          (globalThis as unknown as { __cyanlyBeacons: unknown[] })
            .__cyanlyBeacons,
      );
    await expect
      .poll(
        async () =>
          ((await readBeacons()) as Array<Record<string, unknown>>).filter(
            (b) => b.event_name === "add_to_cart",
          ).length,
        { timeout: 10000 },
      )
      .toBeGreaterThan(0);

    const beacons = (await readBeacons()) as Array<Record<string, unknown>>;
    const evt = beacons.find((b) => b.event_name === "add_to_cart");
    expect(evt, "expected an add_to_cart beacon").toBeDefined();
    const props = JSON.parse(
      (evt as Record<string, unknown>).properties as string,
    ) as Record<string, unknown>;

    // ::<number> coercion: price is a real number, not the string "899".
    expect(typeof props.price).toBe("number");
    expect(props.price).toBe(899);
    // Un-annotated shorthand values stay strings.
    expect(typeof props.product_id).toBe("string");
    expect(props.product_id).toBe("vr-headset");
    expect(typeof props.product_name).toBe("string");

    console.log(
      `[CustomEvent] magic-string coercion verified: price=${props.price} (${typeof props.price})`,
    );
  });
});
