import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

// Cross-tenant isolation — the admin of workspace "Acme" must not reach the
// "Zeta" project that lives in the other workspace ("Globex"). Runs as admin.

test.describe("multi-tenant isolation (admin)", () => {
  test("SEC-01: opening another workspace's project by URL shows nothing", async ({
    page,
  }) => {
    const zetaId = readSeed().projects.zeta;
    await page.goto(`/?project=${zetaId}&view=list`);
    await expect(page.getByText("Zeta Project")).toHaveCount(0);
  });

  test("SEC-05: projects API returns only the caller's workspace projects", async ({
    page,
  }) => {
    const res = await page.request.get("/api/projects");
    expect(res.ok()).toBeTruthy();
    const names = (await res.json()).map((p: { name: string }) => p.name);
    expect(names).toContain("Alpha Project");
    expect(names).not.toContain("Zeta Project");
  });

  test("SEC-03: mutating another workspace's project via API is rejected", async ({
    page,
  }) => {
    const zetaId = readSeed().projects.zeta;
    const res = await page.request.patch(`/api/projects/${zetaId}`, {
      data: { name: "HACKED" },
    });
    expect([401, 403, 404]).toContain(res.status());

    // And the tasks endpoint must not serve that project's data.
    const tasksRes = await page.request.get(`/api/tasks?project_id=${zetaId}`);
    const denied =
      [401, 403, 404].includes(tasksRes.status()) ||
      (tasksRes.ok() && (await tasksRes.json()).length === 0);
    expect(denied).toBeTruthy();
  });
});
