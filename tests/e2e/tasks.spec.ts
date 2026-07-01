import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Task CRUD via the List view's inline quick-add + row menu (admin).

test.describe("tasks (List view)", () => {
  test("TASK-02: inline quick-add creates a task", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    const title = `E2E Task ${Date.now()}`;
    await page.goto(`/?project=${alphaId}&view=list`);
    await page.locator("button.tl-add").click();
    await page.getByPlaceholder("Write a task name").fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByText(title)).toBeVisible();
  });

  test("TASK-04: delete a task via the row menu", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    const title = `E2E Del ${Date.now()}`;
    await page.goto(`/?project=${alphaId}&view=list`);
    await page.locator("button.tl-add").click();
    await page.getByPlaceholder("Write a task name").fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByText(title)).toBeVisible();

    const row = page.locator(".tl-row", { hasText: title });
    await row.getByRole("button", { name: "Row actions" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, Delete it" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
