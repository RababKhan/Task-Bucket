import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getUserById, verifyPassword } from "@/lib/auth-db";

// Check whether the supplied current password is correct (for the two-step
// change-password flow: verify current before revealing the new-password
// fields). Own-account only, so it's not a general oracle.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const current = String(body.current ?? "");

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Accounts with no password (OAuth-only) have nothing to verify.
  if (!user.password_hash) return NextResponse.json({ ok: true });

  return NextResponse.json({ ok: verifyPassword(current, user.password_hash) });
}
