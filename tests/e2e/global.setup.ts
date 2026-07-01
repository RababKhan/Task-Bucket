import { test as setup } from "@playwright/test";
import { resetAndSeed } from "./helpers/seed";
import { login } from "./helpers/auth";
import { USERS, PASSWORD, authFile, type RoleKey } from "./fixtures";

// Runs once before the suite (as a dependency of the chromium project):
// wipes + seeds the test DB, then logs each seeded user in and saves their
// session to a storageState file the specs reuse.
setup("seed database + authenticate roles", async ({ browser }) => {
  setup.setTimeout(120_000);
  await resetAndSeed();

  for (const role of Object.keys(USERS) as RoleKey[]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, USERS[role].email, PASSWORD);
    await ctx.storageState({ path: authFile(role) });
    await ctx.close();
  }
});
