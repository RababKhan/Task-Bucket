import { test, expect, type Page } from "@playwright/test";
import { readSeed } from "./fixtures";
import { withDb } from "./helpers/db";

// Tooltips (`data-tip`) are drawn by <TooltipLayer> into a fixed-position node
// at the end of the body. They used to be a ::after on the element, which a
// scroll container clips: `.column-cards` sets only `overflow-y: auto`, but
// that computes `overflow-x` to `auto` too, so a board card's tooltip lost its
// sides to the column. A long assignee name showed it worst.

// Long enough that, centred under the first avatar, the pill reaches past the
// left edge of the column that holds the card.
const LONG_NAME = "Rabab Khan Rongon";

/** Box of the pill currently on screen, plus where it sits in the DOM. */
async function pill(page: Page) {
  const el = page.locator(".tip-pop");
  await expect(el).toBeVisible();
  return {
    text: (await el.textContent())?.trim(),
    box: (await el.boundingBox())!,
    insideScroller: await el.evaluate(
      (n) => !!n.closest(".column-cards, .board, .main"),
    ),
  };
}

test.describe("tooltips", () => {
  let taskTitle: string;

  test.beforeAll(async () => {
    // Put a long-named assignee on a seeded backlog card, so the board renders
    // the avatar whose tooltip was being cut off.
    await withDb(async (c) => {
      const seed = readSeed();
      const memberId = seed.users.member;
      await c.query("UPDATE users SET name = $1 WHERE id = $2", [
        LONG_NAME,
        memberId,
      ]);
      const t = await c.query<{ id: number; title: string }>(
        `SELECT id, title FROM tasks
          WHERE project_id = $1 AND status = 'backlog'
          ORDER BY position LIMIT 1`,
        [seed.projects.alpha],
      );
      taskTitle = t.rows[0].title;
      await c.query(
        `INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [t.rows[0].id, memberId],
      );
    });
  });

  test("an assignee tooltip on a board card is not clipped by its column", async ({
    page,
  }) => {
    const alphaId = readSeed().projects.alpha;
    await page.goto(`/?project=${alphaId}&view=board`);

    const card = page.locator(".board .card", { hasText: taskTitle });
    await expect(card).toBeVisible();
    const avatar = card.locator(".card-person").first();
    await avatar.hover();

    const tip = await pill(page);
    expect(tip.text).toBe(LONG_NAME);

    // It escapes every scroll container, so nothing can clip it.
    expect(tip.insideScroller).toBe(false);

    // This is the case that used to break: the pill genuinely reaches past the
    // left edge of the column, and is now drawn there instead of being cut.
    const clip = (await page.locator(".column-cards").first().boundingBox())!;
    expect(tip.box.x).toBeLessThan(clip.x);

    // And it stays on screen.
    const view = page.viewportSize()!;
    expect(tip.box.x).toBeGreaterThanOrEqual(0);
    expect(tip.box.x + tip.box.width).toBeLessThanOrEqual(view.width);
    expect(tip.box.y).toBeGreaterThanOrEqual(0);
    expect(tip.box.y + tip.box.height).toBeLessThanOrEqual(view.height);
  });

  test("the tooltip clears when the pointer leaves", async ({ page }) => {
    const alphaId = readSeed().projects.alpha;
    await page.goto(`/?project=${alphaId}&view=board`);

    const card = page.locator(".board .card", { hasText: taskTitle });
    await card.locator(".card-person").first().hover();
    await expect(page.locator(".tip-pop")).toBeVisible();

    await page.locator(".main-header").first().hover();
    await expect(page.locator(".tip-pop")).toHaveCount(0);
  });

  test("a tooltip near the bottom of the window flips above its element", async ({
    page,
  }) => {
    const alphaId = readSeed().projects.alpha;
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto(`/?project=${alphaId}&view=board`);

    const card = page.locator(".board .card", { hasText: taskTitle });
    await expect(card).toBeVisible();
    const avatar = card.locator(".card-person").first();
    const anchor = (await avatar.boundingBox())!;
    await avatar.hover();

    const tip = await pill(page);
    const view = page.viewportSize()!;
    expect(tip.box.y + tip.box.height).toBeLessThanOrEqual(view.height);
    // Below would have run off the short window, so it is drawn above instead.
    if (anchor.y + anchor.height + tip.box.height > view.height) {
      expect(tip.box.y).toBeLessThan(anchor.y);
    }
  });
});
