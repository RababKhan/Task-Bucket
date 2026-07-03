import { test, expect } from "@playwright/test";

// Dashboard aggregates workspace data (admin).

test.describe("dashboard", () => {
  test("shows KPI tiles and the projects widget", async ({ page }) => {
    await page.goto("/dashboard");
    // KPI tiles (unique labels)
    await expect(page.getByText("Total projects")).toBeVisible();
    await expect(page.getByText("Sprint overdue")).toBeVisible();
    // Widget section headings
    await expect(
      page.getByRole("heading", { name: "Active sprints" })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    // Projects widget lists a seeded project
    await expect(page.getByText("Alpha Project")).toBeVisible();
  });
});
