import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";
import { getUserById, type DbUser } from "@/lib/auth-db";

const OTP_TTL_MS = 60 * 1000; // 1 minute
const RESET_TTL_MS = 10 * 60 * 1000; // 10 minutes to set the new password
const MAX_ATTEMPTS = 5;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Store timestamps as UTC "YYYY-MM-DD HH:MM:SS" (matches the rest of the DB).
function isoPlus(ms: number): string {
  return new Date(Date.now() + ms).toISOString().replace("T", " ").slice(0, 19);
}

function isExpired(iso: string | null): boolean {
  if (!iso) return true;
  return new Date(iso + "Z").getTime() < Date.now();
}

type OtpRow = {
  user_id: string;
  otp_hash: string | null;
  expires_at: string | null;
  attempts: number;
  reset_token_hash: string | null;
  reset_expires_at: string | null;
};

// Generate a fresh 6-digit code for the user, replacing any prior one.
export async function createOtp(userId: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await dbRun("DELETE FROM password_otps WHERE user_id = ?", [userId]);
  await dbRun(
    "INSERT INTO password_otps (user_id, otp_hash, expires_at) VALUES (?, ?, ?)",
    [userId, sha256(code), isoPlus(OTP_TTL_MS)]
  );
  return code;
}

export type VerifyResult =
  | { ok: true; resetToken: string }
  | { ok: false; error: string };

// Verify a submitted code. On success, issue a short-lived reset token that
// authorizes the "set new password" step.
export async function verifyOtp(
  userId: string,
  code: string
): Promise<VerifyResult> {
  const row = await dbGet<OtpRow>(
    "SELECT * FROM password_otps WHERE user_id = ?",
    [userId]
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
      "UPDATE password_otps SET attempts = attempts + 1 WHERE user_id = ?",
      [userId]
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

  // Correct — burn the OTP and mint a reset token.
  const resetToken = randomBytes(32).toString("hex");
  await dbRun(
    `UPDATE password_otps
     SET otp_hash = NULL, expires_at = NULL, attempts = 0,
         reset_token_hash = ?, reset_expires_at = ?
     WHERE user_id = ?`,
    [sha256(resetToken), isoPlus(RESET_TTL_MS), userId]
  );

  return { ok: true, resetToken };
}

// Validate a reset token issued by verifyOtp. Returns the owning user, or null.
export async function consumeResetToken(
  rawToken: string
): Promise<DbUser | null> {
  const row = await dbGet<{
    user_id: string;
    reset_expires_at: string | null;
  }>(
    "SELECT user_id, reset_expires_at FROM password_otps WHERE reset_token_hash = ?",
    [sha256(rawToken)]
  );

  if (!row) return null;
  if (isExpired(row.reset_expires_at)) {
    await dbRun("DELETE FROM password_otps WHERE user_id = ?", [row.user_id]);
    return null;
  }
  return (await getUserById(row.user_id)) ?? null;
}
