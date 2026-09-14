import { test, expect } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readSeed, authFile } from "./fixtures";
import { withDb } from "./helpers/db";

// Task attachments (real files in Supabase Storage, not inlined in Postgres —
// see lib/attachments.ts). Admin holds tasks:upload/tasks:download by default
// (lib/permissions.ts), so these run as admin like the rest of task detail.

const dir = mkdtempSync(path.join(tmpdir(), "tb-att-"));
const textFile = path.join(dir, "notes.txt");
writeFileSync(textFile, "hello from the attachments test\n".repeat(20));

test.describe("task attachments", () => {
  test("ATT-01: the + opens a small upload modal; upload, see it listed, download it, then remove it", async ({
    page,
  }) => {
    const alphaId = readSeed().projects.alpha;
    await page.goto(`/?project=${alphaId}&view=list`);
    await page
      .locator(".tl-row", { hasText: "Design homepage" })
      .locator(".tl-title-text")
      .click();
    await expect(page).toHaveURL(/\/task\/\d+/);

    const section = page.locator(".td-section-toggle", {
      hasText: "Attachments",
    });
    await expect(section).toBeVisible();
    await expect(section.locator(".td-section-count")).toHaveText("0");
    // No inline drag-and-drop/"Add files" control in the section itself —
    // uploading only happens through the "+" button's modal.
    await expect(page.locator(".att-dropzone")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add files" })).toHaveCount(0);

    const plusBtn = page
      .locator(".td-section-head", { has: section })
      .locator(".td-section-add");
    await plusBtn.click();
    const modal = page.locator(".attach-modal");
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Click to upload")).toBeVisible();
    await expect(modal.getByText("Max file size 20MB")).toBeVisible();

    await modal.locator('input[type="file"]').setInputFiles(textFile);
    // The modal closes itself once the upload succeeds.
    await expect(modal).toHaveCount(0);

    const item = page.locator(".td-att-item", { hasText: "notes.txt" });
    await expect(item).toBeVisible();
    await expect(section.locator(".td-section-count")).toHaveText("1");

    // The download link is a real, working signed Supabase Storage URL —
    // confirm it actually serves the file's bytes, not just that it exists.
    const href = await item.locator(".td-att-name").getAttribute("href");
    expect(href).toMatch(/^https:\/\/.*supabase\.co\/storage\/v1\/object\/sign\//);
    const dl = await page.request.get(href!);
    expect(dl.status()).toBe(200);
    expect((await dl.body()).toString()).toContain(
      "hello from the attachments test"
    );

    await item.hover();
    await item.locator(".td-att-remove").click();
    await expect(item).toHaveCount(0);
    await expect(section.locator(".td-section-count")).toHaveText("0");
  });

  test("ATT-02: rejects a file over the 20MB limit, with the real reason", async ({
    page,
  }) => {
    const alphaId = readSeed().projects.alpha;
    await page.goto(`/?project=${alphaId}&view=list`);
    await page
      .locator(".tl-row", { hasText: "Design homepage" })
      .locator(".tl-title-text")
      .click();
    await expect(page).toHaveURL(/\/task\/\d+/);
    await page
      .locator(".td-section-toggle", { hasText: "Attachments" })
      .waitFor();

    // 21MB — over the cap. Checking the exact message, not just the status,
    // matters here: middleware.ts runs on every request and (via Next's
    // middlewareClientMaxBodySize) used to silently truncate anything past
    // 10MB into a broken multipart body before the route ever saw it, which
    // failed with the wrong reason ("No file provided.") instead of this one.
    // See the experimental.middlewareClientMaxBodySize setting in
    // next.config.mjs, which is the actual fix for that.
    const big = await page.evaluate(async () => {
      const file = new File([new Uint8Array(21 * 1024 * 1024)], "big.bin");
      const fd = new FormData();
      fd.append("file", file);
      const taskId = window.location.pathname.split("/").pop();
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: fd,
      });
      return { status: res.status, body: await res.json() };
    });
    expect(big.status).toBe(400);
    expect(big.body.error).toBe("Files must be 20MB or smaller.");

    // 15MB — comfortably inside the cap, but past the 10MB point that used to
    // break silently. This is the case the bug above actually broke: this
    // upload goes straight through the API (not the UI's own file input), so
    // reloading afterward confirms it actually lands, not just that this
    // page's local state says it did.
    const ok = await page.evaluate(async () => {
      const file = new File([new Uint8Array(15 * 1024 * 1024)], "ok.bin");
      const fd = new FormData();
      fd.append("file", file);
      const taskId = window.location.pathname.split("/").pop();
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: fd,
      });
      return { status: res.status, body: await res.json() };
    });
    expect(ok.status).toBe(200);

    await page.reload();
    const okItem = page.locator(".td-att-item", { hasText: "ok.bin" });
    await expect(okItem).toBeVisible();
    await okItem.hover();
    await okItem.locator(".td-att-remove").click();
    await expect(okItem).toHaveCount(0);
  });

  test.describe("member", () => {
    test.use({ storageState: authFile("member") });

    test("ATT-03: a member without tasks:upload is rejected by the API", async ({
      page,
    }) => {
      // Revoke the grant this spec relies on being present (added by
      // scripts/backfill-task-attachment-perms.mjs / seed-roles.ts), assert
      // the route's requirePermission(userId, "tasks", "upload") actually
      // rejects, then always put it back so no other spec is affected.
      await withDb((c) =>
        c.query(
          `DELETE FROM role_permissions
            WHERE module = 'tasks' AND action = 'upload'
              AND role_id IN (SELECT id FROM roles WHERE key = 'assignee')`
        )
      );
      try {
        const alphaId = readSeed().projects.alpha;
        await page.goto(`/?project=${alphaId}&view=list`);
        // Task id 1 is "Design homepage" in Alpha, seeded first — the same
        // task ATT-01 exercises.
        const res = await page.request.post(`/api/tasks/1/attachments`, {
          multipart: {
            file: { name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("x") },
          },
        });
        expect(res.status()).toBe(403);
      } finally {
        await withDb((c) =>
          c.query(
            `INSERT INTO role_permissions (role_id, workspace_id, module, action)
               SELECT id, workspace_id, 'tasks', 'upload' FROM roles WHERE key = 'assignee' AND is_system = 1
             ON CONFLICT DO NOTHING`
          )
        );
      }
    });
  });
});
