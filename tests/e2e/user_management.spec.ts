import { test, expect } from "@playwright/test";

test.describe("User Management APIs", () => {
  test.describe.configure({ mode: 'serial' });

  let token: string;
  let testUserId: string;
  const testUsername = `api_testuser_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const testEmail = `${testUsername}@example.com`;


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

  test("should create a new user", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: testUsername,
        nickname: "Test User 1",
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
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.username).toBe(testUsername);
    testUserId = data.id;
  });

  test("should reject creating a user with duplicate username or email (409)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: testUsername, // duplicate
        nickname: "Duplicate User",
        email: "some-other-email@example.com",
        password: "password123",
        is_superuser: false,
        sites: [],
      },
    });
    expect(res.status()).toBe(409);

    const res2 = await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: `some-other-username-${Date.now()}`,
        nickname: "Duplicate User",
        email: testEmail, // duplicate
        password: "password123",
        is_superuser: false,
        sites: [],
      },
    });
    expect(res2.status()).toBe(409);
  });

  test("should validate malformed inputs (400)", async ({ request }) => {
    const res = await request.post("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: "bad_email_user",
        nickname: "Bad Email",
        email: "not-an-email",
        password: "password123",
        is_superuser: false,
        sites: [],
      },
    });
    expect(res.status()).toBe(400);
  });

  test("should list users", async ({ request }) => {
    const res = await request.get("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
    const found = data.find((u: any) => u.id === testUserId);
    expect(found).toBeDefined();
    expect(found.username).toBe(testUsername);
    expect(found.sites[0].site_id).toBe("example-next-js");
  });

  test("should reject non-superuser access (403)", async ({ request }) => {
    // login as the newly created test user
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: {
        email: testEmail,
        password: "password123",
      },
    });
    expect(loginRes.status()).toBe(200);
    const data = await loginRes.json();
    const normalToken = data.access_token;

    // try to list users
    const listRes = await request.get("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${normalToken}` },
    });
    expect(listRes.status()).toBe(403);
  });

  test("should update user profile", async ({ request }) => {
    const res = await request.put(`http://localhost:8081/api/v1/users/${testUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        username: `${testUsername}_updated`,
        nickname: "Test User Updated",
        email: testEmail,
        password: "newpassword456",
        is_superuser: false,
      },
    });
    expect(res.status()).toBe(200);

    // Verify login with new password
    const loginRes = await request.post("http://localhost:8081/api/v1/auth/login", {
      data: {
        email: testEmail,
        password: "newpassword456",
      },
    });
    expect(loginRes.status()).toBe(200);

    const getRes = await request.get("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const users = await getRes.json();
    const updated = users.find((u: any) => u.id === testUserId);
    expect(updated.username).toBe(`${testUsername}_updated`);
    expect(updated.nickname).toBe("Test User Updated");
  });

  test("should add a new site permission", async ({ request }) => {
    const res = await request.post(`http://localhost:8081/api/v1/users/${testUserId}/sites`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        site_id: "example-vite-react-router",
        permissions: [{ effect: "allow", actions: ["read:realtime"] }],
      },
    });
    expect(res.status()).toBe(201);
  });

  test("should update existing site permissions", async ({ request }) => {
    const res = await request.put(`http://localhost:8081/api/v1/users/${testUserId}/sites/example-next-js`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        permissions: [{ effect: "allow", actions: ["read:analytics", "read:realtime"] }],
      },
    });
    expect(res.status()).toBe(200);
  });

  test("should delete a site permission", async ({ request }) => {
    const res = await request.delete(`http://localhost:8081/api/v1/users/${testUserId}/sites/example-vite-react-router`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
  });

  test("should return 404 for non-existent user operations", async ({ request }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.delete(`http://localhost:8081/api/v1/users/${fakeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(404);
  });

  test("should delete the user", async ({ request }) => {
    const res = await request.delete(`http://localhost:8081/api/v1/users/${testUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);

    // Verify deletion
    const listRes = await request.get("http://localhost:8081/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const list = await listRes.json();
    expect(list.find((u: any) => u.id === testUserId)).toBeUndefined();
  });
});

test.describe("User Management Dashboard UI", () => {
  test("should render users list, create, edit, and delete a user", async ({ page, request }) => {


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

    // 2. Navigate to users page
    await page.goto("http://localhost:8079/en/users");
    await expect(page.locator("h1")).toContainText(/User Management|Manage Users|Users/i);

    // Wait for the user card of the superadmin to appear
    await expect(page.locator("text=@admin")).toBeVisible();

    // 3. Create a new user
    await page.getByTestId("create-user-btn").click();
    await expect(page.locator("#create-user-form")).toBeVisible();
    
    const ts = Date.now();
    const testUsername = `uitest_${ts}`;
    const testEmail = `uitest_${ts}@example.com`;

    await page.fill("input[name='username']", testUsername);
    await page.fill("input[name='nickname']", "UI Test User");
    await page.fill("input[name='email']", testEmail);
    await page.fill("input[name='password']", "password123");

    await page.getByTestId("add-site-auth-btn").click();
    await page.fill("input[name='sites.0.site_id']", "example-next-js");

    await page.getByTestId("create-user-submit-btn").click();

    // Expect the dialog to close and the new user to appear
    await expect(page.getByTestId(`user-card-${testUsername}`)).toBeVisible();

    // 4. Edit User
    const userCard = page.getByTestId(`user-card-${testUsername}`);
    await userCard.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.locator("#edit-user-form")).toBeVisible();
    await page.fill("input[name='nickname']", "UI Test User Updated");
    await page.getByTestId("edit-user-submit-btn").click();
    
    // Expect nickname to be updated in the list
    await expect(userCard.locator("h3").first()).toContainText("UI Test User Updated");

    // 5. Delete User
    await userCard.getByRole('button', { name: 'Delete', exact: true }).click();

    // Confirm deletion in the custom dialog
    const confirmDialog = page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: 'Are you sure?' });
    await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click();

    // Expect the user to be removed
    await expect(page.getByTestId(`user-card-${testUsername}`)).toHaveCount(0);
  });
});
