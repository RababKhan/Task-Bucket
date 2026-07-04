import { NextResponse } from "next/server";
import { getUserByEmail, verifyPassword } from "@/lib/auth-db";

// Login pre-check: given valid credentials, report whether a 2FA code is also
// needed so the login form can reveal the code field. Returns mfaRequired:false
// for bad credentials (the sign-in attempt then fails normally).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  const user = await getUserByEmail(email);
  if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ mfaRequired: false });
  }
  return NextResponse.json({ mfaRequired: !!user.mfa_enabled });
}
