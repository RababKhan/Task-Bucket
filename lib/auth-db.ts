import {
  scryptSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { dbGet, dbRun } from "@/lib/db";

export type DbUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  password_hash: string | null;
  email_verified: string | null;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  mfa_backup_codes: string | null;
  created_at: string;
};

// ---- Password hashing (scrypt, no native deps) ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;
  const hashBuf = Buffer.from(hashHex, "hex");
  const testBuf = scryptSync(password, salt, 64);
  return hashBuf.length === testBuf.length && timingSafeEqual(hashBuf, testBuf);
}

// ---- User lookups ----
export function getUserByEmail(email: string): Promise<DbUser | undefined> {
  return dbGet<DbUser>("SELECT * FROM users WHERE email = ? COLLATE NOCASE", [
    email.trim(),
  ]);
}

export function getUserById(id: string): Promise<DbUser | undefined> {
  return dbGet<DbUser>("SELECT * FROM users WHERE id = ?", [id]);
}

// ---- Credentials signup ----
export async function createCredentialsUser(
  email: string,
  password: string,
  name: string
): Promise<DbUser> {
  const id = randomUUID();
  await dbRun(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
    [id, name.trim() || null, email.trim(), hashPassword(password)]
  );
  return (await getUserById(id))!;
}

// ---- OAuth sign-in: find-or-create + link by email ----
export async function upsertOAuthUser(params: {
  provider: string;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): Promise<DbUser> {
  const { provider, providerAccountId } = params;
  const email = params.email?.trim() || null;

  // 1. Already linked?
  const link = await dbGet<{ user_id: string }>(
    "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?",
    [provider, providerAccountId]
  );
  if (link) {
    return (await getUserById(link.user_id))!;
  }

  // 2. Existing user with same (verified) email? Link this provider to them.
  let user = email ? await getUserByEmail(email) : undefined;

  if (!user) {
    // 3. Brand new user.
    const id = randomUUID();
    await dbRun(
      "INSERT INTO users (id, name, email, image, email_verified) VALUES (?, ?, ?, ?, datetime('now'))",
      [id, params.name ?? null, email, params.image ?? null]
    );
    user = (await getUserById(id))!;
  } else if (!user.image && params.image) {
    await dbRun("UPDATE users SET image = ? WHERE id = ?", [
      params.image,
      user.id,
    ]);
  }

  await dbRun(
    "INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)",
    [user.id, provider, providerAccountId]
  );

  return (await getUserById(user.id))!;
}

// ---- Set a new password (used by the OTP reset flow) ----
// OTP generation / verification lives in lib/otp.ts.
export async function setUserPassword(userId: string, password: string) {
  await dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [
    hashPassword(password),
    userId,
  ]);
  // Invalidate any outstanding reset state for this user.
  await dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
  await dbRun("DELETE FROM password_otps WHERE user_id = ?", [userId]);
}
