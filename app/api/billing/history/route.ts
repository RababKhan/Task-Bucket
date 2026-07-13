import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getMembership } from "@/lib/membership";
import { getBillingHistory } from "@/lib/billing";

// Past subscription activations for the caller's workspace.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const m = await getMembership(userId);
  if (!m) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }
  const history = await getBillingHistory(m.workspace_id);
  return NextResponse.json({ history });
}
