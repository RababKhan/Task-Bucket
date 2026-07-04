import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { currentUserId } from "@/lib/session";
import { getUserById } from "@/lib/auth-db";
import { startMfaSetup } from "@/lib/security-db";
import { generateSecret, otpauthUrl } from "@/lib/totp";

// Begin TOTP setup: generate a secret (stored but not yet enabled) and return
// the otpauth URL + a QR data-URL for the authenticator app to scan.
export async function POST() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mfa_enabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is already enabled." },
      { status: 400 }
    );
  }

  const secret = generateSecret();
  await startMfaSetup(userId, secret);
  const url = otpauthUrl(secret, user.email ?? "account", "Task Bucket");
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 200 });

  return NextResponse.json({ secret, otpauthUrl: url, qr });
}
