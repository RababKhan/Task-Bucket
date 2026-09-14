import { test, expect } from "@playwright/test";
import { authFile, USERS, PASSWORD } from "./fixtures";
import { withDb } from "./helpers/db";
import { login } from "./helpers/auth";

test.describe("RBAC", () => {
  test("RBAC-01: admin can view AND manage the Roles matrix", async ({
    page,
  }) => {
    await page.goto("/settings/roles");
    await expect(page.getByText("Functionality")).toBeVisible();
    await expect(page.getByText("Project Manager")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create role" })).toBeVisible();
  });

  test("RBAC-02: admin creates a custom role", async ({ page }) => {
    const roleName = `QA ${Date.now()}`;
    await page.goto("/settings/roles");
    await page.getByRole("button", { name: "Create role" }).click();
    // The role is created at once as a new "Employee" column, with its name
    // open for editing in the header.
    const rename = page.getByRole("textbox", { name: /^Rename / });
    await expect(rename).toHaveValue("Employee");
    await rename.fill(roleName);
    await rename.press("Enter");
    await expect(page.getByText(roleName)).toBeVisible();
    // Saved, not just shown: the new name survives a reload.
    await page.reload();
    await expect(page.getByText(roleName)).toBeVisible();
  });

  test.describe("manager", () => {
    test.use({ storageState: authFile("manager") });

    test("RBAC-07: manager can view the matrix but not manage it, and can invite", async ({
      page,
    }) => {
      // Read-only: matrix visible, but no manage control.
      await page.goto("/settings/roles");
      await expect(page.getByText("Functionality")).toBeVisible();
      await expect(page.getByRole("button", { name: "Create role" })).toHaveCount(
        0
      );

      // Directory: allowed, and can invite members.
      await page.goto("/directory");
      await expect(page.getByText("Mia Member")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Invite member" })
      ).toBeVisible();
    });
  });

  test.describe("owner", () => {
    // A fresh, storageState-free session: the seeded admin's role is
    // promoted to "owner" directly in the DB, then this test logs in for
    // real, since the shared admin.json cookie was minted before the
    // promotion and still carries the old role.
    test.use({ storageState: { cookies: [], origins: [] } });

    test("RBAC-08: an Owner sees everything an Admin does, not less", async ({
      page,
    }) => {
      // Several places across the app used to compare a role directly to
      // "admin" — e.g. app/(app)/settings/layout.tsx, .../workspace/page.tsx,
      // app/api/workspace/branding/route.ts — which silently excluded an
      // Owner's own account from Workspace settings, Billing, and White
      // labeling. The fix is lib/permissions.ts's hasFullAccess (Owner OR
      // Admin) everywhere admin-or-better access is meant, and a plain
      // `role === "owner"` check for the one thing that's genuinely
      // Owner-only: deleting the workspace (gated on workspaces.owner_id in
      // app/api/workspace/route.ts, not a role).
      await withDb((c) =>
        c.query(
          `UPDATE workspace_members SET role = 'owner'
             WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
          [USERS.admin.email]
        )
      );
      try {
        await login(page, USERS.admin.email, PASSWORD);

        await page.goto("/settings/roles");
        const tabs = await page.locator(".settings-subtab").allTextContents();
        expect(tabs).toEqual([
          "Profile",
          "Workspace settings",
          "Billing",
          "Roles & Permissions",
        ]);

        // Workspace settings: Edit control and the Branding card both need
        // more than a bare "Profile"-only view.
        await page.getByRole("link", { name: "Workspace settings" }).click();
        await expect(page).toHaveURL(/\/settings\/workspace/);
        await expect(
          page.locator(".settings-card-title", { hasText: "Branding" })
        ).toBeVisible();
        await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

        // The Danger Zone (delete workspace) is Owner-only, not just
        // admin-or-better — visible here because this account really is the
        // Owner, not merely because it also happens to be an Admin.
        await page.goto("/settings/profile");
        await expect(
          page.locator(".settings-card-title", { hasText: "Danger zone" })
        ).toBeVisible();
      } finally {
        await withDb((c) =>
          c.query(
            `UPDATE workspace_members SET role = 'admin'
               WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
            [USERS.admin.email]
          )
        );
      }
    });
  });
});
