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
    // Projects widget lists a seeded project. Scoped to that widget on
    // purpose: the same name also sits beside a task in "My tasks" and beside
    // a sprint in "Active sprints", so once earlier specs have left the admin
    // with either, a bare text match finds several elements and fails.
    await expect(
      page.locator(".db-project-name", { hasText: "Alpha Project" })
    ).toBeVisible();
  });
});
