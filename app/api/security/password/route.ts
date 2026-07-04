import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getUserById, verifyPassword } from "@/lib/auth-db";
import { changePassword } from "@/lib/security-db";

// Change (or, for OAuth-only accounts, set) the signed-in user's password.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accounts that already have a password must prove the current one.
  if (user.password_hash) {
    if (!current) {
      return NextResponse.json(
        { error: "Enter your current password.", field: "current" },
        { status: 400 }
      );
    }
    if (!verifyPassword(current, user.password_hash)) {
      return NextResponse.json(
        { error: "Current password is incorrect.", field: "current" },
        { status: 400 }
      );
    }
  }

  if (next.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters.", field: "next" },
      { status: 400 }
    );
  }
  if (user.password_hash && verifyPassword(next, user.password_hash)) {
    return NextResponse.json(
      { error: "New password must be different.", field: "next" },
      { status: 400 }
    );
  }

  await changePassword(userId, next);
  return NextResponse.json({ ok: true });
}
