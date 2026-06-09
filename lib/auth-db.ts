import {
  scryptSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import db from "@/lib/db";

export type DbUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  password_hash: string | null;
  email_verified: string | null;
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
export function getUserByEmail(email: string): DbUser | undefined {
  return db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(email.trim()) as DbUser | undefined;
}

export function getUserById(id: string): DbUser | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | DbUser
    | undefined;
}

// If this is the very first user, claim the seeded (unowned) sample project(s).
function claimOrphanProjectsIfFirstUser(userId: string) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  if (n === 1) {
    db.prepare(
      "UPDATE projects SET owner_id = ? WHERE owner_id IS NULL"
    ).run(userId);
  }
}

// ---- Credentials signup ----
export function createCredentialsUser(
  email: string,
  password: string,
  name: string
): DbUser {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)"
  ).run(id, name.trim() || null, email.trim(), hashPassword(password));
  claimOrphanProjectsIfFirstUser(id);
  return getUserById(id)!;
}

// ---- OAuth sign-in: find-or-create + link by email ----
export function upsertOAuthUser(params: {
  provider: string;
  providerAccountId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}): DbUser {
  const { provider, providerAccountId } = params;
  const email = params.email?.trim() || null;

  // 1. Already linked?
  const link = db
    .prepare(
      "SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_account_id = ?"
    )
    .get(provider, providerAccountId) as { user_id: string } | undefined;
  if (link) {
    return getUserById(link.user_id)!;
  }

  // 2. Existing user with same (verified) email? Link this provider to them.
  let user = email ? getUserByEmail(email) : undefined;

  if (!user) {
    // 3. Brand new user.
    const id = randomUUID();
    db.prepare(
      "INSERT INTO users (id, name, email, image, email_verified) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run(id, params.name ?? null, email, params.image ?? null);
    user = getUserById(id)!;
    claimOrphanProjectsIfFirstUser(id);
  } else if (!user.image && params.image) {
    db.prepare("UPDATE users SET image = ? WHERE id = ?").run(
      params.image,
      user.id
    );
  }

  db.prepare(
    "INSERT INTO oauth_accounts (user_id, provider, provider_account_id) VALUES (?, ?, ?)"
  ).run(user.id, provider, providerAccountId);

  return getUserById(user.id)!;
}

// ---- Set a new password (used by the OTP reset flow) ----
// OTP generation / verification lives in lib/otp.ts.
export function setUserPassword(userId: string, password: string) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    hashPassword(password),
    userId
  );
  // Invalidate any outstanding reset state for this user.
  db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM password_otps WHERE user_id = ?").run(userId);
}
