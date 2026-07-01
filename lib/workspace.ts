import { randomUUID } from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";
import { getMembership } from "@/lib/membership";
import { seedRolesForWorkspace } from "@/lib/seed-roles";
import {
  validateSubdomain,
  slugify,
  SUBDOMAIN_MAX,
  WORKSPACE_DOMAIN,
} from "@/lib/subdomain";

// Re-export the pure helpers so server modules can keep importing from here.
export { validateSubdomain, slugify, WORKSPACE_DOMAIN };

export type Workspace = {
  id: string;
  owner_id: string;
  name: string;
  subdomain: string;
  created_at: string;
};

export async function isSubdomainAvailable(
  subdomain: string
): Promise<boolean> {
  const row = await dbGet(
    "SELECT 1 AS x FROM workspaces WHERE subdomain = ? COLLATE NOCASE",
    [subdomain.trim().toLowerCase()]
  );
  return !row;
}

export function getWorkspaceByOwner(
  ownerId: string
): Promise<Workspace | undefined> {
  return dbGet<Workspace>("SELECT * FROM workspaces WHERE owner_id = ?", [
    ownerId,
  ]);
}

// Creates a workspace. Throws if the subdomain is taken or invalid; callers
// should validate first for friendly errors.
export async function createWorkspace(
  ownerId: string,
  name: string,
  subdomain: string
): Promise<Workspace> {
  const id = randomUUID();
  await dbRun(
    "INSERT INTO workspaces (id, owner_id, name, subdomain) VALUES (?, ?, ?, ?)",
    [id, ownerId, name.trim(), subdomain.trim().toLowerCase()]
  );
  // The creator is the workspace admin.
  await dbRun(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'admin') ON CONFLICT DO NOTHING",
    [id, ownerId]
  );
  // Provision the three system roles (Admin / Project Manager / Member) and
  // their default permissions for the new workspace right away.
  await seedRolesForWorkspace(id);
  // Start every workspace on the free plan.
  await dbRun(
    "INSERT INTO subscriptions (workspace_id, plan, status) VALUES (?, 'free', 'active') ON CONFLICT DO NOTHING",
    [id]
  );
  // The very first workspace claims the unowned seed project(s).
  const count = await dbGet<{ n: number }>(
    "SELECT COUNT(*) AS n FROM workspaces"
  );
  if (count && count.n === 1) {
    await dbRun(
      "UPDATE projects SET owner_id = ?, workspace_id = ? WHERE owner_id IS NULL",
      [ownerId, id]
    );
  }
  return (await getWorkspaceByOwner(ownerId))!;
}

// Ensures a user has a workspace. If they're already a member of one (e.g. they
// joined via invite), returns that; otherwise auto-provisions one (OAuth
// sign-ups never see the signup form). Returns the workspace.
export async function ensureWorkspaceForUser(
  userId: string,
  displayName?: string | null,
  emailLocal?: string | null
): Promise<Workspace> {
  const membership = await getMembership(userId);
  if (membership) {
    const ws = await dbGet<Workspace>("SELECT * FROM workspaces WHERE id = ?", [
      membership.workspace_id,
    ]);
    if (ws) return ws;
  }

  const base =
    slugify(displayName || "") || slugify(emailLocal || "") || "workspace";

  // Find a free subdomain: base, base-2, base-3, …
  let subdomain = base;
  let suffix = 1;
  while (
    !(await isSubdomainAvailable(subdomain)) ||
    validateSubdomain(subdomain)
  ) {
    suffix += 1;
    subdomain = `${base}-${suffix}`.slice(0, SUBDOMAIN_MAX);
    if (suffix > 1000) {
      subdomain = `workspace-${userId.slice(0, 8)}`;
      break;
    }
  }

  const name = displayName ? `${displayName}'s Workspace` : "My Workspace";
  return createWorkspace(userId, name, subdomain);
}
