import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Board view (admin).

test.describe("board", () => {
  test("VIEW-04: move a task to the next status column", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    const title = `E2E Move ${Date.now()}`;

    // Create a backlog task via the List view, then switch to the Board.
    await page.goto(`/?project=${alphaId}&view=list`);
    await page.locator("button.tl-add").click();
    await page.getByPlaceholder("Write a task name").fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByText(title)).toBeVisible();

    await page
      .locator(".project-tabs")
      .getByRole("link", { name: "Board", exact: true })
      .click();
    await expect(page).toHaveURL(/view=board/);

    const board = page.locator(".board");
    const col0 = board.locator(".column").nth(0); // Backlog
    const col1 = board.locator(".column").nth(1); // next status
    await expect(col0.getByText(title)).toBeVisible();

    // "Move →" is the second button in the card's move controls.
    await board
      .locator(".card", { hasText: title })
      .locator(".card-move button")
      .nth(1)
      .click();

    await expect(col1.getByText(title)).toBeVisible();
    await expect(col0.getByText(title)).toHaveCount(0);
  });
});
