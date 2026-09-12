import {
  test,
  expect,
  type Page,
  type Locator,
  type APIRequestContext,
} from "@playwright/test";
import { readSeed } from "./fixtures";
import { setWorkspacePlan } from "./helpers/db";

// Projects module, as the workspace admin (the default storageState).
//
// Every project created here carries PREFIX in its name and is removed after
// each test through the app's own API, so the seeded Alpha/Beta pair the rest
// of the suite depends on is left exactly as it was.

const PREFIX = "E2E Proj";
// Kept short on purpose: the name input is capped at 32 characters, so a long
// name is silently truncated and a rename can end up doing nothing.
const uniq = (label: string) =>
  `${PREFIX} ${label} ${Date.now().toString(36).slice(-4)}`;

type ApiProject = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  due_date: string | null;
  manager: { name: string; email: string } | null;
  members: { user_id: string; name: string; email: string }[];
};

const row = (page: Page, name: string) =>
  page.locator(".pv-row", { hasText: name });

/** Project names in the table, top to bottom. */
const names = (page: Page) =>
  page
    .locator(".pv-row .pv-title")
    .allInnerTexts()
    .then((list) => list.map((t) => t.trim()));

const listProjects = async (request: APIRequestContext) =>
  (await (await request.get("/api/projects")).json()) as ApiProject[];

const findProject = async (request: APIRequestContext, name: string) =>
  (await listProjects(request)).find((p) => p.name === name);

async function openCreateModal(page: Page) {
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(page.locator(".cp-modal")).toBeVisible();
}

/** Creates a project through the UI and returns once the list shows it. */
async function createProject(page: Page, name: string) {
  await page.goto("/projects");
  await openCreateModal(page);
  const modal = page.locator(".cp-modal");
  await modal.getByPlaceholder("e.g. Manhattan Project").fill(name);
  await modal.getByRole("button", { name: "Create Project" }).click();
  // Creating drops you into the new project's board.
  await expect(page).toHaveURL(/[?&]project=\d+/);
  await page.goto("/projects");
  await expect(row(page, name)).toBeVisible();
}

/** Opens a row's 3-dot menu and clicks one of its items. */
async function rowMenu(page: Page, name: string, item: "Edit" | "Delete") {
  await row(page, name).getByRole("button", { name: "Row actions" }).click();
  await page.locator(".pv-menu").getByRole("button", { name: item }).click();
}

/** Picks a day of the current month from an open-on-click date field. */
async function pickDay(field: Locator, day: number) {
  await field.locator(".dp-trigger, .dp-inline-trigger").click();
  await field
    .page()
    .locator(".dp-cal .dp-day:not(.out)")
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first()
    .click();
}

/** Chooses a person in a MemberPicker (inline or field). */
async function pickPerson(trigger: Locator, person: string, multiple = false) {
  const page = trigger.page();
  await trigger.click();
  await page.locator(".mp-menu").getByText(person, { exact: true }).click();
  // A multi-select stays open so several people can be picked.
  if (multiple) await page.locator(".mp-backdrop").click({ force: true });
  await expect(page.locator(".mp-menu")).toHaveCount(0);
}

/** Sets a status from a StatusDropdown that is already on screen. */
async function pickStatus(trigger: Locator, label: string) {
  await trigger.click();
  await trigger.page().getByRole("option", { name: label, exact: true }).click();
}

/** Removes every project these specs created. */
async function cleanup(request: APIRequestContext) {
  for (const p of await listProjects(request)) {
    if (p.name.startsWith(PREFIX)) await request.delete(`/api/projects/${p.id}`);
  }
}

test.describe("projects", () => {
  test.afterEach(async ({ request }) => {
    await cleanup(request);
  });

  test("PROJ-01: create a project", async ({ page, request }) => {
    const name = uniq("Create");
    await createProject(page, name);
    expect(await findProject(request, name)).toBeTruthy();
  });

  test("PROJ-02: the free plan allows no more than two projects", async ({
    page,
    request,
  }) => {
    const seed = readSeed();
    // The workspace is seeded with Alpha + Beta — exactly the free cap — so
    // going free here puts it at the limit.
    await setWorkspacePlan(seed.workspaces.acme, "free");
    try {
      await page.goto("/projects");
      await expect(page.locator(".pv-row")).toHaveCount(2);

      const plan = await (await request.get("/api/workspace/plan")).json();
      expect(plan.limits.projects).toBe(2);

      // The create button is disabled and says why.
      await expect(
        page.getByRole("button", { name: "Create project", exact: true })
      ).toBeDisabled();
      await expect(page.locator(".topbar-add-wrap")).toHaveAttribute(
        "data-tip",
        /Upgrade to Pro/i
      );

      // And the API refuses a third project even if the UI is bypassed.
      const res = await request.post("/api/projects", {
        data: { name: uniq("Blocked") },
      });
      expect(res.status()).toBe(402);
      expect((await res.json()).code).toBe("plan_limit");
    } finally {
      await setWorkspacePlan(seed.workspaces.acme, "pro");
    }
  });

  test("PROJ-03: the Pro plan lifts the project cap", async ({
    page,
    request,
  }) => {
    const plan = await (await request.get("/api/workspace/plan")).json();
    expect(plan.limits.projects).toBeNull();

    // A third and a fourth project — past the free cap — both go through.
    await createProject(page, uniq("Pro A"));
    await createProject(page, uniq("Pro B"));
    await expect(page.locator(".pv-row")).toHaveCount(4);
    await expect(
      page.getByRole("button", { name: "Create project", exact: true })
    ).toBeEnabled();
  });

  test("PROJ-04: edit every field from the edit modal", async ({
    page,
    request,
  }) => {
    const name = uniq("Fields");
    const renamed = uniq("Fields2");
    await createProject(page, name);

    await rowMenu(page, name, "Edit");
    const m = page.locator(".cp-modal");
    await m.getByPlaceholder("e.g. Manhattan Project").fill(renamed);
    await m
      .getByPlaceholder("What is this project about? (optional)")
      .fill("Edited by E2E");
    await pickStatus(m.locator(".status-dd button"), "At Risk");
    await pickDay(m.locator(".field", { hasText: "Start Date" }), 10);
    await pickDay(m.locator(".field", { hasText: "Estimated Due Date" }), 20);
    await pickPerson(
      m.locator(".field", { hasText: "Project Manager" }).locator(".mp-trigger"),
      "Max Manager"
    );
    await pickPerson(
      m.locator(".field", { hasText: "Project Members" }).locator(".mp-trigger"),
      "Mia Member",
      true
    );
    await m.getByRole("button", { name: "Update Project" }).click();
    await expect(m).toHaveCount(0);

    // Every field survives a reload.
    await page.reload();
    await expect(row(page, renamed)).toBeVisible();
    const saved = await findProject(request, renamed);
    expect(saved?.description).toBe("Edited by E2E");
    expect(saved?.status).toBe("at_risk");
    expect(saved?.start_date).toMatch(/-10$/);
    expect(saved?.due_date).toMatch(/-20$/);
    expect(saved?.manager?.name).toBe("Max Manager");
    expect(saved?.members.map((x) => x.name)).toContain("Mia Member");
  });

  test("PROJ-05: edit every editable column in the table", async ({
    page,
    request,
  }) => {
    const name = uniq("Inline");
    await createProject(page, name);
    const r = row(page, name);

    await pickStatus(r.locator(".pv-status .status-dd-inline"), "On Hold");
    await pickDay(r.locator(".pv-date"), 15);
    await pickPerson(r.locator(".pv-lead .mp-inline-trigger"), "Max Manager");
    await pickPerson(
      r.locator(".pv-members .mp-inline-trigger"),
      "Mia Member",
      true
    );

    // Each inline edit is saved as it is made.
    await page.reload();
    await expect(row(page, name).locator(".status-dd-current")).toHaveText(
      "On Hold"
    );
    const saved = await findProject(request, name);
    expect(saved?.status).toBe("on_hold");
    expect(saved?.due_date).toMatch(/-15$/);
    expect(saved?.manager?.name).toBe("Max Manager");
    expect(saved?.members.map((x) => x.name)).toContain("Mia Member");
  });

  test("PROJ-06: edit a project from the 3-dot menu", async ({ page }) => {
    const name = uniq("Kebab");
    const renamed = uniq("Kebab2");
    await createProject(page, name);

    await rowMenu(page, name, "Edit");
    const m = page.locator(".cp-modal");
    await m.getByPlaceholder("e.g. Manhattan Project").fill(renamed);
    await m.getByRole("button", { name: "Update Project" }).click();

    await expect(row(page, renamed)).toBeVisible();
    await expect(row(page, name)).toHaveCount(0);
  });

  test("PROJ-07: edit a project from the selection bar", async ({ page }) => {
    const name = uniq("BulkEd");
    const renamed = uniq("BulkEd2");
    await createProject(page, name);

    await row(page, name).locator("input.pv-check").check();
    await page.locator(".pv-selbar").getByRole("button", { name: "Edit" }).click();
    const m = page.locator(".cp-modal");
    await m.getByPlaceholder("e.g. Manhattan Project").fill(renamed);
    await m.getByRole("button", { name: "Update Project" }).click();

    await expect(row(page, renamed)).toBeVisible();
  });

  test("PROJ-08: delete a project from the 3-dot menu", async ({ page }) => {
    const name = uniq("Del Kebab");
    await createProject(page, name);

    await rowMenu(page, name, "Delete");
    await page.getByRole("button", { name: "Yes, Delete it" }).click();
    await expect(row(page, name)).toHaveCount(0);
  });

  test("PROJ-09: delete projects from the selection bar", async ({ page }) => {
    const a = uniq("Del A");
    const b = uniq("Del B");
    await createProject(page, a);
    await createProject(page, b);

    await row(page, a).locator("input.pv-check").check();
    await row(page, b).locator("input.pv-check").check();
    await expect(page.locator(".pv-selcount")).toHaveText("2");
    await page
      .locator(".pv-selbar")
      .getByRole("button", { name: "Delete" })
      .click();
    await page.getByRole("button", { name: "Yes, Delete it" }).click();

    await expect(row(page, a)).toHaveCount(0);
    await expect(row(page, b)).toHaveCount(0);
  });

  test("PROJ-10: search the project list", async ({ page }) => {
    const name = uniq("Findme");
    await createProject(page, name);

    await page.getByPlaceholder("Search").fill(name);
    await expect(page.locator(".pv-row")).toHaveCount(1);
    await expect(row(page, name)).toBeVisible();

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByText("Alpha Project")).toBeVisible();
  });

  test("PROJ-11: sort the table, and the sort survives a reload", async ({
    page,
  }) => {
    await createProject(page, uniq("Sort"));

    await page.locator(".pv-sort").getByRole("button", { name: "Sort" }).click();
    await page.locator(".pv-sort-menu").getByRole("button", { name: "Name" }).click();

    const sortedByName = (list: string[]) =>
      [...list].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const afterSort = await names(page);
    expect(afterSort).toEqual(sortedByName(afterSort));
    await expect(page.locator(".pv-sort-tag")).toHaveText("Name");

    await page.reload();
    await expect(page.locator(".pv-sort-tag")).toHaveText("Name");
    expect(await names(page)).toEqual(afterSort);
  });

  test("PROJ-12: filter the table, and the filter survives a reload", async ({
    page,
  }) => {
    const name = uniq("Filter");
    await createProject(page, name);
    // The seeded projects are all On Track, so At Risk isolates this one.
    await pickStatus(
      row(page, name).locator(".pv-status .status-dd-inline"),
      "At Risk"
    );

    await page.getByRole("button", { name: "Filter" }).click();
    await page.locator(".tf-field", { hasText: "Status" }).click();
    await page
      .locator(".tf-values .pv-filter-opt")
      .filter({ hasText: "At Risk" })
      .click();
    await page.locator(".pv-menu-backdrop").first().click({ position: { x: 4, y: 4 } });

    await expect(page.locator(".pv-row")).toHaveCount(1);
    await expect(row(page, name)).toBeVisible();

    await page.reload();
    await expect(page.locator(".tf-chip")).toHaveCount(1);
    await expect(page.locator(".pv-row")).toHaveCount(1);
    await expect(row(page, name)).toBeVisible();

    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByText("Alpha Project")).toBeVisible();
  });

  test("PROJ-13: choose which columns the table shows", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator(".pv-head")).toContainText("Progress");

    await page.getByRole("button", { name: "View" }).click();
    const drawer = page.locator(".pv-drawer");
    await drawer
      .locator(".pv-colrow", { hasText: "Progress" })
      .locator("input.pv-check")
      .uncheck();
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(drawer).toHaveCount(0);

    await expect(page.locator(".pv-head")).not.toContainText("Progress");
    // Saved for next time.
    await page.reload();
    await expect(page.locator(".pv-head")).not.toContainText("Progress");
  });

  test("PROJ-14: reset the view settings", async ({ page }) => {
    await page.goto("/projects");

    // Change the view: hide a column.
    await page.getByRole("button", { name: "View" }).click();
    let drawer = page.locator(".pv-drawer");
    await drawer
      .locator(".pv-colrow", { hasText: "Members" })
      .locator("input.pv-check")
      .uncheck();
    await drawer.getByRole("button", { name: "Save" }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.locator(".pv-head")).not.toContainText("Member");

    // Reset puts the defaults back, and saving keeps them.
    await page.getByRole("button", { name: "View" }).click();
    drawer = page.locator(".pv-drawer");
    await drawer.getByRole("button", { name: "Reset" }).click();
    await expect(
      drawer.locator(".pv-colrow", { hasText: "Members" }).locator("input.pv-check")
    ).toBeChecked();
    await drawer.getByRole("button", { name: "Save" }).click();
    // The drawer closes only once the preference has been written; reloading
    // before that would race the save.
    await expect(drawer).toHaveCount(0);

    await expect(page.locator(".pv-head")).toContainText("Member");
    await page.reload();
    await expect(page.locator(".pv-head")).toContainText("Member");
  });

  test("PROJ-15: drag a row to reorder the table", async ({ page }) => {
    await createProject(page, uniq("Drag"));
    const before = await names(page);
    expect(before.length).toBeGreaterThan(1);

    await page.locator(".pv-row").first().dragTo(page.locator(".pv-row").nth(1));

    // The dragged row swaps with the one it was dropped on. (The order is a
    // view-only arrangement — the app does not store it.)
    const after = await names(page);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });
});
