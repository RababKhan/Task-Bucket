import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";

// Email verification for the signup wizard (no user row exists yet, so this is
// keyed by email rather than user id — see lib/otp.ts for the reset flow).
const OTP_TTL_MS = 60 * 1000; // 60 seconds to enter the code (matches the timer)
const VERIFY_TTL_MS = 30 * 60 * 1000; // 30 minutes to finish signup after verifying
const MAX_ATTEMPTS = 5;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
function isoPlus(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace("T", " ").slice(0, 19);
}
function isExpired(iso: string | null): boolean {
  if (!iso) return true;
  return new Date(iso + "Z").getTime() < Date.now();
}
function norm(email: string): string {
  return email.trim().toLowerCase();
}

type Row = {
  email: string;
  otp_hash: string | null;
  expires_at: string | null;
  attempts: number;
  verify_token_hash: string | null;
  verify_expires_at: string | null;
};

export async function createSignupOtp(email: string): Promise<string> {
  const e = norm(email);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await dbRun("DELETE FROM signup_otps WHERE email = ? COLLATE NOCASE", [e]);
  await dbRun(
    "INSERT INTO signup_otps (email, otp_hash, expires_at) VALUES (?, ?, ?)",
    [e, sha256(code), isoPlus(OTP_TTL_MS)]
  );
  return code;
}

export type VerifyResult =
  | { ok: true; verifyToken: string }
  | { ok: false; error: string };

export async function verifySignupOtp(
  email: string,
  code: string
): Promise<VerifyResult> {
  const e = norm(email);
  const row = await dbGet<Row>(
    "SELECT * FROM signup_otps WHERE email = ? COLLATE NOCASE",
    [e]
  );

  if (!row || !row.otp_hash || !row.expires_at) {
    return { ok: false, error: "Invalid or expired code. Please request a new one." };
  }
  if (isExpired(row.expires_at)) {
    return { ok: false, error: "This code has expired. Please request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many attempts. Please request a new code." };
  }

  const provided = Buffer.from(sha256(code), "hex");
  const stored = Buffer.from(row.otp_hash, "hex");
  const matches =
    provided.length === stored.length && timingSafeEqual(provided, stored);

  if (!matches) {
    await dbRun(
      "UPDATE signup_otps SET attempts = attempts + 1 WHERE email = ? COLLATE NOCASE",
      [e]
    );
    const left = MAX_ATTEMPTS - (row.attempts + 1);
    return {
      ok: false,
      error:
        left > 0
          ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many attempts. Please request a new code.",
    };
  }

  const verifyToken = randomBytes(32).toString("hex");
  await dbRun(
    `UPDATE signup_otps
     SET otp_hash = NULL, expires_at = NULL, attempts = 0,
         verify_token_hash = ?, verify_expires_at = ?
     WHERE email = ? COLLATE NOCASE`,
    [sha256(verifyToken), isoPlus(VERIFY_TTL_MS), e]
  );

  return { ok: true, verifyToken };
}

// Used by /api/register to confirm the email was verified in this signup.
export async function isSignupVerified(
  email: string,
  token: string
): Promise<boolean> {
  if (!token) return false;
  const row = await dbGet<{
    verify_token_hash: string | null;
    verify_expires_at: string | null;
  }>(
    "SELECT verify_token_hash, verify_expires_at FROM signup_otps WHERE email = ? COLLATE NOCASE",
    [norm(email)]
  );
  if (!row || !row.verify_token_hash) return false;
  if (isExpired(row.verify_expires_at)) return false;
  const a = Buffer.from(sha256(token), "hex");
  const b = Buffer.from(row.verify_token_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function clearSignupOtp(email: string): Promise<void> {
  await dbRun("DELETE FROM signup_otps WHERE email = ? COLLATE NOCASE", [
    norm(email),
  ]);
}
