import "server-only";
import { dbRun } from "@/lib/db";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";

// Seeds the three system roles (Admin / Project Manager / Member) and their
// default permission grants for a single workspace. Idempotent: the role insert
// relies on UNIQUE(workspace_id, key) and the permission insert on the
// (role_id, module, action) primary key, so re-running never duplicates rows
// and never clobbers an admin's later edits to a system role's matrix.
//
// Called at workspace-creation time (lib/workspace.ts) so brand-new workspaces
// get roles immediately, without waiting for the next process restart. The
// migration in lib/db.ts performs the equivalent backfill for pre-existing
// workspaces using the raw client (to avoid a circular import).

const SYSTEM_ROLES: {
  key: "admin" | "manager" | "assignee";
  name: string;
  description: string;
}[] = [
  { key: "admin", name: "Admin", description: "Full access to everything." },
  {
    key: "manager",
    name: "Project Manager",
    description: "Manages assigned projects, tasks, members, and reports.",
  },
  {
    key: "assignee",
    name: "Member",
    description: "Views assigned projects and works on assigned tasks.",
  },
];

export async function seedRolesForWorkspace(workspaceId: string): Promise<void> {
  for (const r of SYSTEM_ROLES) {
    await dbRun(
      `INSERT INTO roles (workspace_id, key, name, description, is_system, active)
       VALUES (?, ?, ?, ?, 1, 1) ON CONFLICT DO NOTHING`,
      [workspaceId, r.key, r.name, r.description]
    );
  }

  // Insert the default permission grants for each system role.
  for (const r of SYSTEM_ROLES) {
    const grants = DEFAULT_PERMISSIONS[r.key];
    for (const [module, action] of grants) {
      await dbRun(
        `INSERT INTO role_permissions (role_id, workspace_id, module, action)
         SELECT id, workspace_id, ?, ?
         FROM roles WHERE workspace_id = ? AND key = ?
         ON CONFLICT DO NOTHING`,
        [module, action, workspaceId, r.key]
      );
    }
  }
}
