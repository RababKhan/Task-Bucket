import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Sprint lifecycle (admin). Alpha starts with no sprints each run.

test.describe("sprints", () => {
  test("SPR-01/03: create a planned sprint then start it", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    const name = `E2E Sprint ${Date.now()}`;
    await page.goto(`/?project=${alphaId}&view=sprint`);

    await page.getByRole("button", { name: "Create New Sprint" }).click();
    const modal = page.locator(".sprint-modal");
    await modal.getByPlaceholder("e.g. Onethread Redesign").fill(name);
    // Turn OFF auto-start so the sprint is created as "planned".
    await modal.getByRole("switch").click();
    await modal.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText(name)).toBeVisible();

    // A planned sprint offers "Start Sprint"; after starting it offers "End Sprint".
    const card = page.locator(".sprint-card", { hasText: name });
    await card.getByRole("button", { name: "Start Sprint" }).click();
    await expect(card.getByRole("button", { name: "End Sprint" })).toBeVisible();
  });
});
