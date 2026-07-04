import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getUserById } from "@/lib/auth-db";
import { disableMfa, consumeBackupCode } from "@/lib/security-db";
import { verifyTotp } from "@/lib/totp";

// Turn off TOTP two-factor auth. Requires a valid authenticator code (or a
// backup code) so a walk-up attacker on an open session can't disable it.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();

  const user = await getUserById(userId);
  if (!user?.mfa_enabled || !user.mfa_secret) {
    return NextResponse.json(
      { error: "Two-factor authentication is not enabled." },
      { status: 400 }
    );
  }

  const ok =
    verifyTotp(user.mfa_secret, code) ||
    (await consumeBackupCode(userId, code));
  if (!ok) {
    return NextResponse.json(
      { error: "That code is incorrect or expired.", field: "code" },
      { status: 400 }
    );
  }

  await disableMfa(userId);
  return NextResponse.json({ ok: true });
}
