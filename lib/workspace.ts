import { randomUUID } from "node:crypto";
import db from "@/lib/db";
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

export function isSubdomainAvailable(subdomain: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM workspaces WHERE subdomain = ? COLLATE NOCASE")
    .get(subdomain.trim().toLowerCase());
  return !row;
}

export function getWorkspaceByOwner(ownerId: string): Workspace | undefined {
  return db
    .prepare("SELECT * FROM workspaces WHERE owner_id = ?")
    .get(ownerId) as Workspace | undefined;
}

// Creates a workspace. Throws if the subdomain is taken or invalid; callers
// should validate first for friendly errors.
export function createWorkspace(
  ownerId: string,
  name: string,
  subdomain: string
): Workspace {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO workspaces (id, owner_id, name, subdomain) VALUES (?, ?, ?, ?)"
  ).run(id, ownerId, name.trim(), subdomain.trim().toLowerCase());
  return getWorkspaceByOwner(ownerId)!;
}

// Ensures a user has a workspace, auto-provisioning one for OAuth sign-ups
// (who never see the signup form). Returns the existing or new workspace.
export function ensureWorkspaceForUser(
  userId: string,
  displayName?: string | null,
  emailLocal?: string | null
): Workspace {
  const existing = getWorkspaceByOwner(userId);
  if (existing) return existing;

  const base =
    slugify(displayName || "") || slugify(emailLocal || "") || "workspace";

  // Find a free subdomain: base, base-2, base-3, …
  let subdomain = base;
  let suffix = 1;
  while (!isSubdomainAvailable(subdomain) || validateSubdomain(subdomain)) {
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
