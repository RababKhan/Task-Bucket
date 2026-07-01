import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Comments on a task (admin).

test.describe("comments", () => {
  test("CMT-01: add a comment to a task", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    const body = `E2E comment ${Date.now()}`;

    await page.goto(`/?project=${alphaId}&view=list`);
    await page
      .locator(".tl-row", { hasText: "Design homepage" })
      .locator(".tl-title-text")
      .click();
    await expect(page).toHaveURL(/\/task\/\d+/);

    await page.getByRole("button", { name: "Comments", exact: true }).click();
    await page.getByPlaceholder(/Write a message/).fill(body);
    await page.getByRole("button", { name: "Send", exact: true }).click();

    await expect(page.getByText(body)).toBeVisible();
  });
});
