import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/auth-db";
import { createSignupOtp } from "@/lib/signup-otp";
import { sendEmail, signupCodeEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  // On signup it's helpful (and standard) to tell the user the email is taken.
  if (getUserByEmail(email)) {
    return NextResponse.json(
      {
        error:
          "An account with this email already exists. Try signing in instead.",
      },
      { status: 409 }
    );
  }

  const code = createSignupOtp(email);
  try {
    const { subject, html, text } = signupCodeEmail(code);
    await sendEmail({ to: email, subject, html, text });
  } catch (err) {
    console.error("[signup/send-code] failed to send code:", err);
  }

  return NextResponse.json({ ok: true });
}
