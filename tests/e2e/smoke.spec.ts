import { test, expect } from "@playwright/test";
import { authFile } from "./fixtures";

// Validates the whole harness: seeding, per-role auth, tenant scoping, RBAC.

test.describe("auth", () => {
  test("AUTH-07: unauthenticated visit redirects to an auth page", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await ctx.newPage();
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/(login|signup)/);
    await ctx.close();
  });

  test("AUTH-02: seeded admin is signed in and sees seeded projects", async ({
    page,
  }) => {
    await page.goto("/projects");
    await expect(page.getByText("Alpha Project")).toBeVisible();
    await expect(page.getByText("Beta Project")).toBeVisible();
  });

  test("AUTH-03: invalid credentials show an error", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill("admin@e2e.test");
    await page.getByPlaceholder("••••••••").fill("definitely-wrong");
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await ctx.close();
  });

  test("AUTH-06: logout clears the session", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "Account menu" }).click();
    const logout = page.getByRole("button", { name: /logout|sign out/i });
    await logout.waitFor({ state: "visible" });
    await logout.click();
    await page.waitForURL(/\/login/, { timeout: 20000 });
    // Protected route now bounces back to an auth page.
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/(login|signup)/);
  });
});

test.describe("tenant scoping + RBAC (member)", () => {
  test.use({ storageState: authFile("member") });

  test("SEC-02: member sees only their assigned project", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("Alpha Project")).toBeVisible();
    await expect(page.getByText("Beta Project")).toHaveCount(0);
  });

  test("RBAC-06: member is denied the Roles page", async ({ page }) => {
    await page.goto("/settings/roles");
    await expect(
      page.getByRole("heading", { name: /access denied/i })
    ).toBeVisible();
  });
});

test.describe("directory (admin)", () => {
  test("TEAM-01: directory lists workspace members", async ({ page }) => {
    await page.goto("/directory");
    await expect(page.getByText("Max Manager")).toBeVisible();
    await expect(page.getByText("Mia Member")).toBeVisible();
  });
});
