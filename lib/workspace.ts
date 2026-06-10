import { randomUUID } from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";
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
  return (await getWorkspaceByOwner(ownerId))!;
}

// Ensures a user has a workspace, auto-provisioning one for OAuth sign-ups
// (who never see the signup form). Returns the existing or new workspace.
export async function ensureWorkspaceForUser(
  userId: string,
  displayName?: string | null,
  emailLocal?: string | null
): Promise<Workspace> {
  const existing = await getWorkspaceByOwner(userId);
  if (existing) return existing;

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
