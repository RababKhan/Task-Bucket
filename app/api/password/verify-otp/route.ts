import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/auth-db";
import { verifyOtp } from "@/lib/otp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const otp = String(body.otp ?? "").trim();

  if (!email || !/^\d{6}$/.test(otp)) {
    return NextResponse.json(
      { error: "Enter the 6-digit code." },
      { status: 400 }
    );
  }

  const user = getUserByEmail(email);
  // Same generic error whether the user exists or the code is wrong.
  if (!user) {
    return NextResponse.json(
      { error: "Invalid or expired code. Please request a new one." },
      { status: 400 }
    );
  }

  const result = verifyOtp(user.id, otp);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ resetToken: result.resetToken });
}
