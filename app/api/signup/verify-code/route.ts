import { NextResponse } from "next/server";
import { verifySignupOtp } from "@/lib/signup-otp";

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

  const result = verifySignupOtp(email, otp);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ verifyToken: result.verifyToken });
}
