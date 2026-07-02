import { NextResponse } from "next/server";
import { dbRun } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getWorkspaceByOwner } from "@/lib/workspace";

// Delete the caller's workspace. Owner-only and irreversible — the workspace
// row cascades to projects, tasks, members, roles, invites, subscriptions, etc.
// Requires a confirmation string matching the workspace name or subdomain.
export async function DELETE(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ws = await getWorkspaceByOwner(userId);
  if (!ws) {
    return NextResponse.json(
      { error: "Only the workspace owner can delete it." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirm = String(body.confirm ?? "").trim();
  if (confirm !== ws.name && confirm !== ws.subdomain) {
    return NextResponse.json(
      { error: "Confirmation text does not match the workspace name." },
      { status: 400 }
    );
  }

  await dbRun("DELETE FROM workspaces WHERE id = ? AND owner_id = ?", [
    ws.id,
    userId,
  ]);

  return NextResponse.json({ ok: true });
}
