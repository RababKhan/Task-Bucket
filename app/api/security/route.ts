import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getSecurityInfo } from "@/lib/security-db";

// Account-security summary for the Settings > Security card.
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const info = await getSecurityInfo(userId);
  return NextResponse.json(info);
}
