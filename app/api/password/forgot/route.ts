import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/auth-db";
import { createOtp } from "@/lib/otp";
import { sendEmail, otpEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();

  // Always respond the same way so we don't leak which emails are registered.
  const generic = NextResponse.json({ ok: true });
  if (!email) return generic;

  const user = getUserByEmail(email);
  if (!user || !user.email) return generic;

  const code = createOtp(user.id);

  try {
    const { subject, html, text } = otpEmail(code);
    await sendEmail({ to: user.email, subject, html, text });
  } catch (err) {
    console.error("[password/forgot] failed to send code:", err);
  }

  return generic;
}
