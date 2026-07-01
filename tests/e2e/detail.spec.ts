import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Task detail page (admin).

test.describe("task detail", () => {
  test("DET-01: open a task from the list shows its detail", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    await page.goto(`/?project=${alphaId}&view=list`);
    await page
      .locator(".tl-row", { hasText: "Design homepage" })
      .locator(".tl-title-text")
      .click();
    await expect(page).toHaveURL(/\/task\/\d+/);
    await expect(page.locator("textarea.td-title")).toHaveValue(
      /Design homepage/
    );
  });
});
