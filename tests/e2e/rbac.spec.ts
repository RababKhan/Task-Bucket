import { test, expect } from "@playwright/test";
import { authFile } from "./fixtures";

test.describe("RBAC", () => {
  test("RBAC-01: admin can view AND manage the Roles matrix", async ({
    page,
  }) => {
    await page.goto("/settings/roles");
    await expect(page.getByText("Functionality")).toBeVisible();
    await expect(page.getByText("Project Manager")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create role" })).toBeVisible();
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
});
