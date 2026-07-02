import { test, expect } from "@playwright/test";

// The Tasks module aggregates tasks across all accessible projects (admin).

test.describe("tasks module", () => {
  test("shows tasks across projects and opens detail", async ({ page }) => {
    await page.goto("/tasks");
    // Seeded Alpha tasks appear in the cross-project list.
    await expect(page.getByText("Design homepage")).toBeVisible();
    await expect(page.getByText("Write launch copy")).toBeVisible();

    await page.getByText("Design homepage").click();
    await expect(page).toHaveURL(/\/task\/\d+/);
  });
});
