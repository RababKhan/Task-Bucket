import { test, expect, type Page } from "@playwright/test";

// Runs as the workspace admin (default storageState). Mutation tests use
// unique names and clean up so the shared seeded data (Alpha/Beta) is untouched.

function openCreateModal(page: Page) {
  return page.getByRole("button", { name: "Create project", exact: true }).click();
}

test.describe("projects", () => {
  test("PROJ-11: clicking a project row opens its board", async ({ page }) => {
    await page.goto("/projects");
    // Click the title (row center holds non-navigating inline editors).
    await page
      .locator(".pv-row", { hasText: "Alpha Project" })
      .locator(".pv-title")
      .click();
    await expect(page).toHaveURL(/[?&]project=\d+/);
    await expect(
      page.getByRole("heading", { name: "Alpha Project", level: 1 })
    ).toBeVisible();
  });

  test("PROJ-06: search filters the list and clear resets it", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByText("Beta Project")).toBeVisible();
    await page.getByPlaceholder("Search").fill("Alpha");
    await expect(page.getByText("Alpha Project")).toBeVisible();
    await expect(page.getByText("Beta Project")).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByText("Beta Project")).toBeVisible();
  });

  test("PROJ-01: create a project appears in the list", async ({ page }) => {
    const name = `E2E Create ${Date.now()}`;
    await page.goto("/projects");
    await openCreateModal(page);
    const modal = page.locator(".cp-modal");
    await modal.getByPlaceholder("e.g. Manhattan Project").fill(name);
    await modal.getByRole("button", { name: "Create Project" }).click();
    await expect(page).toHaveURL(/[?&]project=\d+/);
    // Verify via the list (board heading can lag a background revalidation).
    await page.goto("/projects");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("PROJ-02 + PROJ-03: edit then delete a project", async ({ page }) => {
    const name = `E2E Edit ${Date.now()}`;
    const renamed = `${name} v2`;

    // create
    await page.goto("/projects");
    await openCreateModal(page);
    const cm = page.locator(".cp-modal");
    await cm.getByPlaceholder("e.g. Manhattan Project").fill(name);
    await cm.getByRole("button", { name: "Create Project" }).click();
    await expect(page).toHaveURL(/\/\?project=\d+/);

    // edit (from the list)
    await page.goto("/projects");
    const row = page.locator(".pv-row", { hasText: name });
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Edit" }).click();
    const em = page.locator(".cp-modal");
    await em.getByPlaceholder("e.g. Manhattan Project").fill(renamed);
    await em.getByRole("button", { name: "Update Project" }).click();
    await expect(page.getByText(renamed)).toBeVisible();

    // delete
    const row2 = page.locator(".pv-row", { hasText: renamed });
    await row2.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, Delete it" }).click();
    await expect(page.getByText(renamed)).toHaveCount(0);
  });

  test("PROJ-04: bulk-select and delete projects", async ({ page }) => {
    const a = `E2E Bulk A ${Date.now()}`;
    const b = `E2E Bulk B ${Date.now()}`;
    for (const n of [a, b]) {
      await page.goto("/projects");
      await openCreateModal(page);
      const m = page.locator(".cp-modal");
      await m.getByPlaceholder("e.g. Manhattan Project").fill(n);
      await m.getByRole("button", { name: "Create Project" }).click();
      await expect(page).toHaveURL(/[?&]project=\d+/);
    }

    await page.goto("/projects");
    await page.locator(".pv-row", { hasText: a }).locator("input.pv-check").check();
    await page.locator(".pv-row", { hasText: b }).locator("input.pv-check").check();
    await page.locator(".pv-selbar").getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, Delete it" }).click();
    await expect(page.getByText(a)).toHaveCount(0);
    await expect(page.getByText(b)).toHaveCount(0);
  });
});
