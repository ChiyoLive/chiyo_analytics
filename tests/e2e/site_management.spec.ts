import { test, expect } from "@playwright/test";

type SiteListItem = {
  id: string;
  name: string;
  jwks_url: string | null;
  created_at: string;
  updated_at: string;
};

test.describe("Site Management APIs", () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  const testSiteId = `api_testsite_${Date.now()}`;
  const testSiteName = "Test Site Name 1";

  test.beforeAll(async ({ request }) => {
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    expect(loginRes.status()).toBe(200);
    const data = await loginRes.json();
    token = data.access_token;
  });

  test("should create a new site", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: testSiteId,
        name: testSiteName,
        jwks_url: "http://localhost:9999/jwks.json",
      },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.id).toBe(testSiteId);
    expect(data.name).toBe(testSiteName);
  });

  test("should reject creating a site with duplicate ID (409)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: testSiteId, // duplicate
        name: "Some Other Site",
      },
    });
    expect(res.status()).toBe(409);
  });

  test("should validate malformed inputs (400)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: "bad id with spaces",
        name: "Bad ID",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("should list sites", async ({ request }) => {
    const res = await request.get("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    const found = data.find((s: SiteListItem) => s.id === testSiteId);
    expect(found).toBeDefined();
    expect(found.name).toBe(testSiteName);
  });

  test("should update site details", async ({ request }) => {
    const res = await request.put(`http://localhost:8081/api/v1/sites/${testSiteId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Updated Site Name",
        jwks_url: "http://localhost:9999/jwks2.json",
      },
    });
    expect(res.status()).toBe(200);

    const getRes = await request.get("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sites = await getRes.json();
    const updated = sites.find((s: SiteListItem) => s.id === testSiteId);
    expect(updated.name).toBe("Updated Site Name");
    expect(updated.jwks_url).toBe("http://localhost:9999/jwks2.json");
  });

  test("should reject SSRF payloads in jwks_url (400)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: `ssrf_test_${Date.now()}`,
        name: "SSRF Test",
        jwks_url: "ftp://127.0.0.1/jwks.json",
      },
    });
    expect(res.status()).toBe(400);

    const res2 = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: `ssrf_test2_${Date.now()}`,
        name: "SSRF Test 2",
        jwks_url: "javascript:alert(1)",
      },
    });
    expect(res2.status()).toBe(400);
  });

  test("should reject payloads exceeding max length (400)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        id: `len_test_${Date.now()}`,
        name: "A".repeat(300), // Exceeds 255
      },
    });
    expect(res.status()).toBe(400);
  });

  test("should reject missing token (401)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/sites", {
      data: {
        id: `unauth_test_${Date.now()}`,
        name: "Unauth Test",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("should reject non-superuser access (403)", async ({ request }) => {
    // 1. Create a normal (non-superuser) user
    const testUsername = `normal_user_${Date.now()}`;
    const testEmail = `${testUsername}@example.com`;
    
    await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: testUsername,
        nickname: "Normal User",
        email: testEmail,
        password: "password123",
        is_superuser: false,
        sites: [],
      },
    });

    // 2. Login as the normal user
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: {
        email: testEmail,
        password: "password123",
      },
    });
    const normalToken = (await loginRes.json()).access_token;

    // 3. Try to list sites
    const getRes = await request.get("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    expect(getRes.status()).toBe(403);
    
    // 4. Try to create a site
    const postRes = await request.post("http://localhost:8081/api/v1/sites", {
      headers: { Authorization: `Bearer ${normalToken}` },
      data: { id: "test-site", name: "Test Site" },
    });
    expect(postRes.status()).toBe(403);
  });
});

test.describe("Site Management Dashboard UI", () => {
  test("should render sites list, create, and edit a site", async ({ page, request }) => {
    // 1. Login as superuser
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: {
        email: "admin@cyanly.local",
        password: "cyanly-admin-secure-password",
      },
    });
    const { access_token, refresh_token } = await loginRes.json();

    await page.goto("http://localhost:8079/en/login");
    await page.evaluate(({ token, refresh }) => {
      localStorage.setItem("cyanly_access_token", token);
      localStorage.setItem("cyanly_refresh_token", refresh);
    }, { token: access_token, refresh: refresh_token });

    // 2. Navigate to sites page
    await page.goto("http://localhost:8079/en/sites");
    await expect(page.locator("h1")).toContainText(/Site Management/i);

    // 3. Create a new site
    await page.getByTestId("create-site-btn").click();
    await expect(page.locator("#create-site-form")).toBeVisible();

    const ts = Date.now();
    const testSiteId = `uisite_${ts}`;
    const testSiteName = `UI Test Site ${ts}`;

    await page.fill("input[name='id']", testSiteId);
    await page.fill("input[name='name']", testSiteName);

    await page.getByTestId("create-site-submit-btn").click();

    // Expect the dialog to close and the new site to appear in the list
    await expect(page.getByTestId(`site-row-${testSiteId}`)).toBeVisible();

    // 4. Edit Site
    const siteRow = page.getByTestId(`site-row-${testSiteId}`);
    await siteRow.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator("#edit-site-form")).toBeVisible();
    await page.fill("input[name='name']", `UI Test Site ${ts} Updated`);
    await page.getByTestId("edit-site-submit-btn").click();

    // Expect name to be updated in the table
    await expect(siteRow.locator("td").nth(1)).toContainText(`UI Test Site ${ts} Updated`);

    // 5. Test XSS in Name safely renders
    await page.getByTestId("create-site-btn").click();
    const xssSiteId = `xss_site_${Date.now()}`;
    const xssPayload = `<script>alert('xss')</script>`;
    await page.fill("input[name='id']", xssSiteId);
    await page.fill("input[name='name']", xssPayload);
    await page.getByTestId("create-site-submit-btn").click();

    // Expect to render as text, not HTML
    await expect(page.getByTestId(`site-row-${xssSiteId}`).locator("td").nth(1)).toHaveText(xssPayload);
  });
});
