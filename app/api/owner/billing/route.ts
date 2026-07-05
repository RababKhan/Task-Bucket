import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { isSuperAdmin } from "@/lib/owner";
import { ownerBillingOverview } from "@/lib/billing";

// Platform-owner view: every workspace's plan, usage, and pending upgrade request.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const workspaces = await ownerBillingOverview();
  return NextResponse.json({ workspaces });
}
