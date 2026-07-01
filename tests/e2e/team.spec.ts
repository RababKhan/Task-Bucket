import { test, expect } from "@playwright/test";
import { readSeed } from "./fixtures";

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

  test("TEAM-09: admin cannot change own role or remove self (API)", async ({
    page,
  }) => {
    const adminId = readSeed().users.admin;
    // Role/active changes + removal go through /api/members/[uid].
    const patch = await page.request.patch(`/api/members/${adminId}`, {
      data: { role: "assignee" },
    });
    expect([400, 403]).toContain(patch.status());

    const del = await page.request.delete(`/api/members/${adminId}`);
    expect([400, 403]).toContain(del.status());
  });
});
