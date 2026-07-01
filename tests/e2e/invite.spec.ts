import { test, expect } from "@playwright/test";
import { readSeed, PROJECTS } from "./fixtures";
import { seedInvite } from "./helpers/db";

// Invite acceptance — new user. Runs signed-out (the invitee has no account).
test.describe("invite acceptance", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("TEAM-05: a new user accepts an invite and joins the workspace", async ({
    page,
  }) => {
    const seed = readSeed();
    const token = `tok-${Date.now()}`;
    const email = `newbie-${Date.now()}@e2e.test`;
    void PROJECTS; // (project access omitted for simplicity)

    await seedInvite({
      email,
      token,
      wsId: seed.workspaces.acme,
      invitedBy: seed.users.admin,
      projectAccess: [seed.projects.alpha],
    });

    await page.goto(`/invite/${token}`);
    await expect(page.getByText(/Join Acme Inc/i)).toBeVisible();

    await page.getByPlaceholder("Jane Doe").fill("New Bie");
    await page.getByPlaceholder(/chars/).fill("Password123!");
    await page.getByRole("button", { name: "Accept invite" }).click();

    // Lands in the app, signed in as the new member.
    await page.waitForURL(/\/($|\?|projects|dashboard)/, { timeout: 20000 });
    await expect(page).not.toHaveURL(/\/invite\//);
  });
});
