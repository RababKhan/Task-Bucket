import { expect, type Page } from "@playwright/test";

// Drive the real credentials login form. On success the app redirects to
// /projects (or the callbackUrl).
export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  // The submit button (not the OAuth "Sign in with …" buttons).
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/(projects|dashboard|\?|$)/, { timeout: 15000 });
}

// Assert the app shell is visible (a signed-in surface).
export async function expectSignedIn(page: Page) {
  await expect(page).not.toHaveURL(/\/login/);
}
