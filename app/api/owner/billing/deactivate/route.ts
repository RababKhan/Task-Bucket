import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { isSuperAdmin } from "@/lib/owner";
import { deactivateSubscription, getWorkspaceMeta } from "@/lib/billing";

// Owner reverts a workspace to Free.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = String(body.workspace_id ?? "").trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required." }, { status: 400 });
  }
  if (!(await getWorkspaceMeta(workspaceId))) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  await deactivateSubscription(workspaceId);
  return NextResponse.json({ ok: true });
}
