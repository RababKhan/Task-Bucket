import { test, expect } from "@playwright/test";

// Team directory + invitations (admin).

test.describe("team / invitations", () => {
  test("TEAM-03: inviting a member creates a pending invite", async ({
    page,
  }) => {
    const email = `invitee-${Date.now()}@e2e.test`;
    await page.goto("/directory");
    await page.getByRole("button", { name: "Invite member" }).click();

    const modal = page.locator(".cp-modal");
    await modal.getByPlaceholder("name@example.com").fill(email);
    await modal.getByRole("button", { name: "Send invite" }).click();

    // The new invite shows up in the pending-invites list on the directory.
    await expect(page.getByText(email)).toBeVisible();
  });
});
