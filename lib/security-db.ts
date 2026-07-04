// Account-security data access: password changes and TOTP two-factor auth.
import { dbGet, dbRun } from "@/lib/db";
import { hashPassword, getUserById } from "@/lib/auth-db";
import { hashBackupCode, normalizeCode } from "@/lib/totp";

export type SecurityInfo = { hasPassword: boolean; mfaEnabled: boolean };

export async function getSecurityInfo(userId: string): Promise<SecurityInfo> {
  const u = await getUserById(userId);
  return {
    hasPassword: !!u?.password_hash,
    mfaEnabled: !!u?.mfa_enabled,
  };
}

export async function changePassword(userId: string, next: string) {
  await dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [
    hashPassword(next),
    userId,
  ]);
}

// Store a freshly generated secret for setup (not yet enabled).
export async function startMfaSetup(userId: string, secret: string) {
  await dbRun(
    "UPDATE users SET mfa_secret = ?, mfa_enabled = false, mfa_backup_codes = NULL WHERE id = ?",
    [secret, userId]
  );
}

// Confirm setup: mark enabled and store hashed backup codes.
export async function enableMfa(userId: string, backupCodes: string[]) {
  const hashed = JSON.stringify(backupCodes.map(hashBackupCode));
  await dbRun(
    "UPDATE users SET mfa_enabled = true, mfa_backup_codes = ? WHERE id = ?",
    [hashed, userId]
  );
}

export async function disableMfa(userId: string) {
  await dbRun(
    "UPDATE users SET mfa_enabled = false, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = ?",
    [userId]
  );
}

// Verify a one-time backup code and consume it (remove from the stored list).
// Returns true if the code matched an unused backup code.
export async function consumeBackupCode(
  userId: string,
  code: string
): Promise<boolean> {
  const u = await dbGet<{ mfa_backup_codes: string | null }>(
    "SELECT mfa_backup_codes FROM users WHERE id = ?",
    [userId]
  );
  if (!u?.mfa_backup_codes) return false;
  let codes: string[];
  try {
    codes = JSON.parse(u.mfa_backup_codes);
  } catch {
    return false;
  }
  const target = hashBackupCode(normalizeCode(code));
  const idx = codes.indexOf(target);
  if (idx === -1) return false;
  codes.splice(idx, 1);
  await dbRun("UPDATE users SET mfa_backup_codes = ? WHERE id = ?", [
    JSON.stringify(codes),
    userId,
  ]);
  return true;
}
