import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Project view tabs (admin).

test.describe("project views", () => {
  test("VIEW-01: tabs switch List/Board/Sprint and update the URL", async ({
    page,
  }) => {
    const alphaId = readSeed().projects.alpha;
    await page.goto(`/?project=${alphaId}&view=list`);

    const tabs = page.locator(".project-tabs");
    await tabs.getByRole("link", { name: "Board", exact: true }).click();
    await expect(page).toHaveURL(/view=board/);

    await tabs.getByRole("link", { name: "Sprint", exact: true }).click();
    await expect(page).toHaveURL(/view=sprint/);

    await tabs.getByRole("link", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
  });
});
