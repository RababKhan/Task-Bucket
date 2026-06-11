// Email sender with graceful fallbacks:
//   1. Resend       — if RESEND_API_KEY is set (recommended; simplest)
//   2. SMTP          — if SMTP_HOST is set (via nodemailer)
//   3. Console log   — otherwise (dev fallback so the flow is testable)

type SendArgs = { to: string; subject: string; html: string; text: string };

const FROM = process.env.EMAIL_FROM || "Task Bucket <onboarding@resend.dev>";

export async function sendEmail({ to, subject, html, text }: SendArgs) {
  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text,
    });
    if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
    return;
  }

  if (process.env.SMTP_HOST) {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
    await transport.sendMail({ from: FROM, to, subject, html, text });
    return;
  }

  // Dev fallback — no email provider configured.
  console.warn(
    "\n[email] No RESEND_API_KEY or SMTP_HOST configured. Printing email instead:\n" +
      `  To:      ${to}\n` +
      `  Subject: ${subject}\n` +
      `  ${text}\n`
  );
}

export function signupCodeEmail(code: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Verify your email for Task Bucket";
  const text = `Welcome to Task Bucket! Your verification code is ${code}. It expires in 60 seconds.\n\nIf you didn't try to sign up, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1a1a1a">
      <h2 style="margin:0 0 12px">Verify your email</h2>
      <p style="color:#555">Enter this code to finish creating your Task Bucket account. It expires in <strong>60 seconds</strong>.</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#f3f5f9;border-radius:10px;padding:18px 0;margin:20px 0;color:#1a1a1a">${code}</div>
      <p style="color:#888;font-size:13px">If you didn't try to sign up, you can safely ignore this email.</p>
    </div>`;
  return { subject, html, text };
}

export function otpEmail(code: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Your Task Bucket verification code";
  const text = `Your password reset code is ${code}. It expires in 60 seconds.\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1a1a1a">
      <h2 style="margin:0 0 12px">Verification code</h2>
      <p style="color:#555">Use this code to reset your Task Bucket password. It expires in <strong>60 seconds</strong>.</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;background:#f3f5f9;border-radius:10px;padding:18px 0;margin:20px 0;color:#1a1a1a">${code}</div>
      <p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
    </div>`;
  return { subject, html, text };
}

export function inviteEmail(
  workspaceName: string,
  role: string,
  inviteUrl: string
): { subject: string; html: string; text: string } {
  const subject = `You're invited to ${workspaceName} on Task Bucket`;
  const text = `You've been invited to join the "${workspaceName}" workspace as ${role} on Task Bucket.\n\nAccept your invite:\n${inviteUrl}\n\nThis link expires in 7 days.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1a1a1a">
      <h2 style="margin:0 0 12px">You're invited 🎉</h2>
      <p style="color:#555">You've been invited to join the <strong>${workspaceName}</strong> workspace as <strong>${role}</strong> on Task Bucket.</p>
      <p style="margin:24px 0">
        <a href="${inviteUrl}" style="background:#3f3f46;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block">Accept invite</a>
      </p>
      <p style="color:#888;font-size:13px">This link expires in 7 days. If you weren't expecting this, you can ignore it.</p>
      <p style="color:#aaa;font-size:12px;word-break:break-all">${inviteUrl}</p>
    </div>`;
  return { subject, html, text };
}

export function passwordResetEmail(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Reset your Task Bucket password";
  const text = `Reset your password using this link (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#1a1a1a">
      <h2 style="margin:0 0 12px">Reset your password</h2>
      <p style="color:#555">We received a request to reset your Task Bucket password. This link is valid for 1 hour.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#5b8def;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block">Reset password</a>
      </p>
      <p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
      <p style="color:#aaa;font-size:12px;word-break:break-all">${resetUrl}</p>
    </div>`;
  return { subject, html, text };
}
