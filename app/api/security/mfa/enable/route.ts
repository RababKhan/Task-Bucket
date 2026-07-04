import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { getUserById } from "@/lib/auth-db";
import { enableMfa } from "@/lib/security-db";
import { verifyTotp, generateBackupCodes } from "@/lib/totp";

// Confirm TOTP setup: verify a 6-digit code against the pending secret, enable
// MFA, and return one-time backup codes (shown once).
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const code = String(body.code ?? "").trim();

  const user = await getUserById(userId);
  if (!user?.mfa_secret) {
    return NextResponse.json(
      { error: "Start setup first." },
      { status: 400 }
    );
  }
  if (user.mfa_enabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is already enabled." },
      { status: 400 }
    );
  }
  if (!verifyTotp(user.mfa_secret, code)) {
    return NextResponse.json(
      { error: "That code is incorrect or expired. Try again.", field: "code" },
      { status: 400 }
    );
  }

  const backupCodes = generateBackupCodes(10);
  await enableMfa(userId, backupCodes);
  return NextResponse.json({ ok: true, backupCodes });
}
