import AppShell from "@/components/app/AppShell";
import PermissionProvider, {
  type InitialPerms,
} from "@/components/app/PermissionProvider";
import { currentUserId } from "@/lib/session";
import { getUserRoleRow, getEffectivePermissions } from "@/lib/rbac";
import { hasFullAccess } from "@/lib/permissions";
import { isSuperAdmin } from "@/lib/owner";
import { dbGet } from "@/lib/db";

// Permissions are resolved here, on the server, and handed to the client
// provider as initial state. Without this the sidebar renders before
// /api/auth/session + /api/permissions/me resolve, so permission-gated links
// (Employee Directory, Platform) pop in a second or two late on every load.
async function resolveInitialPerms(): Promise<{
  perms: InitialPerms | null;
  superAdmin: boolean;
}> {
  const userId = await currentUserId();
  if (!userId) return { perms: null, superAdmin: false };

  const row = await getUserRoleRow(userId);
  if (!row) return { perms: null, superAdmin: await isSuperAdmin(userId) };

  const [roleRow, permissions, superAdmin] = await Promise.all([
    dbGet<{ name: string }>(
      "SELECT name FROM roles WHERE workspace_id = ? AND key = ?",
      [row.workspace_id, row.role]
    ),
    getEffectivePermissions(userId),
    isSuperAdmin(userId),
  ]);

  return {
    perms: {
      role: row.role,
      roleName: roleRow?.name ?? row.role,
      isAdmin: hasFullAccess(row.role),
      active: row.active === 1,
      permissions: [...permissions],
    },
    superAdmin,
  };
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { perms, superAdmin } = await resolveInitialPerms();

  return (
    <PermissionProvider initial={perms}>
      <AppShell isSuperAdmin={superAdmin}>{children}</AppShell>
    </PermissionProvider>
  );
}
