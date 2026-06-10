import { NextResponse } from "next/server";
import { setUserPassword } from "@/lib/auth-db";
import { consumeResetToken } from "@/lib/otp";
import { passwordMeetsRules, passwordRuleFailures } from "@/lib/password";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");

  if (!token) {
    return NextResponse.json({ error: "Missing reset token." }, { status: 400 });
  }
  if (!passwordMeetsRules(password)) {
    return NextResponse.json(
      {
        error: `Password is missing: ${passwordRuleFailures(password).join(", ")}.`,
      },
      { status: 400 }
    );
  }

  const user = await consumeResetToken(token);
  if (!user) {
    return NextResponse.json(
      { error: "Your reset session has expired. Please start over." },
      { status: 400 }
    );
  }

  await setUserPassword(user.id, password);
  return NextResponse.json({ ok: true });
}
