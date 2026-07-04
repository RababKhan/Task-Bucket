import { NextResponse } from "next/server";
import { dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import {
  getWorkspaceByOwner,
  isSubdomainAvailable,
  validateSubdomain,
} from "@/lib/workspace";

// Update the signed-in user's profile: their display name (self), and — for a
// workspace admin/owner — the workspace name and subdomain.
export async function PATCH(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  // 1. Display name (always allowed for the user themselves).
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 100);
    if (!name) {
      return NextResponse.json(
        { error: "Name is required.", field: "name" },
        { status: 400 }
      );
    }
    await dbRun("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
  }

  const membership = await getMembership(userId);

  // 2. Workspace name — admins only.
  if (typeof body.workspace_name === "string" && membership) {
    if (membership.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can rename the workspace.", field: "workspace_name" },
        { status: 403 }
      );
    }
    const wsName = body.workspace_name.trim().slice(0, 80);
    if (!wsName) {
      return NextResponse.json(
        { error: "Workspace name is required.", field: "workspace_name" },
        { status: 400 }
      );
    }
    await dbRun("UPDATE workspaces SET name = ? WHERE id = ?", [
      wsName,
      membership.workspace_id,
    ]);
  }

  // 3. Subdomain — workspace owner only, validated + uniqueness-checked.
  if (typeof body.subdomain === "string") {
    const owned = await getWorkspaceByOwner(userId);
    if (!owned) {
      return NextResponse.json(
        {
          error: "Only the workspace owner can change the subdomain.",
          field: "subdomain",
        },
        { status: 403 }
      );
    }
    const sub = body.subdomain.trim().toLowerCase();
    if (sub !== owned.subdomain) {
      const err = validateSubdomain(sub);
      if (err)
        return NextResponse.json(
          { error: err, field: "subdomain" },
          { status: 400 }
        );
      if (!(await isSubdomainAvailable(sub))) {
        return NextResponse.json(
          { error: "That subdomain is already taken.", field: "subdomain" },
          { status: 400 }
        );
      }
      await dbRun("UPDATE workspaces SET subdomain = ? WHERE id = ?", [
        sub,
        owned.id,
      ]);
    }
  }

  return NextResponse.json({ ok: true });
}
