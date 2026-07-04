"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import FieldError from "@/components/FieldError";
import OtpInput from "@/app/(auth)/OtpInput";

type Info = { hasPassword: boolean; mfaEnabled: boolean };
type Setup = { qr: string; secret: string; otpauthUrl: string };
type FieldErr = { field: string; msg: string } | null;
type Mode = "idle" | "password" | "mfa-setup" | "mfa-backup" | "mfa-disable";

export default function SecurityCard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [mode, setMode] = useState<Mode>("idle");

  // Password form
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState<FieldErr>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwOk, setPwOk] = useState(false);

  // MFA setup / disable
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [mfaErr, setMfaErr] = useState<FieldErr>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [useBackup, setUseBackup] = useState(false); // disable via backup code

  async function load() {
    const res = await fetch("/api/security");
    if (res.ok) setInfo(await res.json());
  }
  useEffect(() => {
    load();
  }, []);

  function resetPw() {
    setPw({ current: "", next: "", confirm: "" });
    setPwErr(null);
    setPwOk(false);
  }
  function resetMfa() {
    setSetup(null);
    setCode("");
    setMfaErr(null);
    setBackupCodes([]);
    setUseBackup(false);
  }

  async function savePassword() {
    if (pwBusy) return;
    setPwErr(null);
    if (pw.next !== pw.confirm) {
      setPwErr({ field: "confirm", msg: "Passwords don't match." });
      return;
    }
    setPwBusy(true);
    const res = await fetch("/api/security/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: pw.current, next: pw.next }),
    });
    const d = await res.json().catch(() => ({}));
    setPwBusy(false);
    if (!res.ok) {
      setPwErr({ field: d.field || "next", msg: d.error || "Could not update." });
      return;
    }
    resetPw();
    setMode("idle");
    setPwOk(true);
    load();
    setTimeout(() => setPwOk(false), 3000);
  }

  async function beginMfaSetup() {
    if (mfaBusy) return;
    resetMfa();
    setMfaBusy(true);
    const res = await fetch("/api/security/mfa/setup", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setMfaBusy(false);
    if (!res.ok) {
      setMfaErr({ field: "", msg: d.error || "Could not start setup." });
      return;
    }
    setSetup(d);
    setMode("mfa-setup");
  }

  async function confirmMfa() {
    if (mfaBusy) return;
    setMfaErr(null);
    setMfaBusy(true);
    const res = await fetch("/api/security/mfa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await res.json().catch(() => ({}));
    setMfaBusy(false);
    if (!res.ok) {
      setMfaErr({ field: "code", msg: d.error || "Could not verify." });
      return;
    }
    setBackupCodes(d.backupCodes || []);
    setCode("");
    setMode("mfa-backup");
    load();
  }

  async function confirmDisable() {
    if (mfaBusy) return;
    setMfaErr(null);
    setMfaBusy(true);
    const res = await fetch("/api/security/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const d = await res.json().catch(() => ({}));
    setMfaBusy(false);
    if (!res.ok) {
      setMfaErr({ field: "code", msg: d.error || "Could not disable." });
      return;
    }
    resetMfa();
    setMode("idle");
    load();
  }

  if (!info) {
    return (
      <div className="settings-card">
        <div className="page-loading">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="security-head">
        <div className="settings-card-title security-card-title">
          <svg className="security-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          Security
        </div>
      </div>

      {/* ---- Password ---- */}
      <div className="security-row">
        <div className="security-row-main">
          <div className="security-title">Password</div>
          <div className="security-desc">
            {info.hasPassword
              ? pwOk
                ? "Password updated."
                : "Change the password you use to sign in."
              : "You signed in with a connected account. Set a password to also sign in with email."}
          </div>
        </div>
        {mode !== "password" && (
          <button
            className="btn btn-sm"
            onClick={() => {
              resetPw();
              setMode("password");
            }}
          >
            {info.hasPassword ? "Change password" : "Set password"}
          </button>
        )}
      </div>

      {mode === "password" && (
        <div className="security-panel">
          {info.hasPassword && (
            <div className="security-field">
              <label>Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                className={`cf-input${pwErr?.field === "current" ? " invalid" : ""}`}
                value={pw.current}
                onChange={(e) => {
                  setPw((p) => ({ ...p, current: e.target.value }));
                  if (pwErr?.field === "current") setPwErr(null);
                }}
              />
              <FieldError message={pwErr?.field === "current" ? pwErr.msg : undefined} />
            </div>
          )}
          <div className="security-field">
            <label>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={`cf-input${pwErr?.field === "next" ? " invalid" : ""}`}
              value={pw.next}
              onChange={(e) => {
                setPw((p) => ({ ...p, next: e.target.value }));
                if (pwErr?.field === "next") setPwErr(null);
              }}
            />
            <FieldError message={pwErr?.field === "next" ? pwErr.msg : undefined} />
          </div>
          <div className="security-field">
            <label>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              className={`cf-input${pwErr?.field === "confirm" ? " invalid" : ""}`}
              value={pw.confirm}
              onChange={(e) => {
                setPw((p) => ({ ...p, confirm: e.target.value }));
                if (pwErr?.field === "confirm") setPwErr(null);
              }}
            />
            <FieldError message={pwErr?.field === "confirm" ? pwErr.msg : undefined} />
          </div>
          <div className="security-actions">
            <button
              className="btn btn-sm"
              onClick={() => {
                resetPw();
                setMode("idle");
              }}
              disabled={pwBusy}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={savePassword}
              disabled={pwBusy || !pw.next || !pw.confirm}
            >
              {pwBusy ? <Spinner /> : "Update password"}
            </button>
          </div>
        </div>
      )}

      <div className="security-divider" />

      {/* ---- Two-factor auth ---- */}
      <div className="security-row">
        <div className="security-row-main">
          <div className="security-title">
            Two-factor authentication
            <span className={`security-badge${info.mfaEnabled ? " on" : ""}`}>
              {info.mfaEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <div className="security-desc">
            Require a code from an authenticator app (Google Authenticator, Authy)
            when you sign in.
          </div>
        </div>
        {mode === "idle" &&
          (info.mfaEnabled ? (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => {
                resetMfa();
                setMode("mfa-disable");
              }}
            >
              Disable
            </button>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={beginMfaSetup} disabled={mfaBusy}>
              {mfaBusy ? <Spinner /> : "Enable"}
            </button>
          ))}
      </div>

      {mfaErr && !mfaErr.field && mode === "idle" && (
        <FieldError message={mfaErr.msg} />
      )}

      {/* Setup: scan QR + verify code */}
      {mode === "mfa-setup" && setup && (
        <div className="security-panel">
          <ol className="mfa-steps">
            <li>Scan this QR code with your authenticator app.</li>
          </ol>
          <div className="mfa-setup-grid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mfa-qr" src={setup.qr} alt="Authenticator QR code" />
            <div className="mfa-manual">
              <div className="security-desc">Or enter this key manually:</div>
              <code className="mfa-secret">{setup.secret}</code>
            </div>
          </div>
          <div className="security-field">
            <label>Enter the 6-digit code to confirm</label>
            <div className="security-otp">
              <OtpInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (mfaErr) setMfaErr(null);
                }}
                invalid={mfaErr?.field === "code"}
              />
            </div>
            <FieldError message={mfaErr?.field === "code" ? mfaErr.msg : undefined} />
          </div>
          <div className="security-actions">
            <button
              className="btn btn-sm"
              onClick={() => {
                resetMfa();
                setMode("idle");
              }}
              disabled={mfaBusy}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={confirmMfa}
              disabled={mfaBusy || code.length < 6}
            >
              {mfaBusy ? <Spinner /> : "Verify & enable"}
            </button>
          </div>
        </div>
      )}

      {/* Backup codes (shown once) */}
      {mode === "mfa-backup" && (
        <div className="security-panel">
          <div className="security-title">Save your backup codes</div>
          <div className="security-desc">
            Each code can be used once if you lose access to your authenticator.
            Store them somewhere safe — they won&apos;t be shown again.
          </div>
          <div className="backup-codes">
            {backupCodes.map((c) => (
              <code key={c}>{c}</code>
            ))}
          </div>
          <div className="security-actions">
            <button
              className="btn btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(backupCodes.join("\n"));
              }}
            >
              Copy codes
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                resetMfa();
                setMode("idle");
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Disable: require a code */}
      {mode === "mfa-disable" && (
        <div className="security-panel">
          <div className="security-desc">
            {useBackup
              ? "Enter one of your backup codes to turn off two-factor authentication."
              : "Enter the 6-digit code from your authenticator app to turn off two-factor authentication."}
          </div>
          <div className="security-field">
            {useBackup ? (
              <input
                autoFocus
                autoComplete="one-time-code"
                className={`cf-input${mfaErr?.field === "code" ? " invalid" : ""}`}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (mfaErr) setMfaErr(null);
                }}
                placeholder="xxxxx-xxxxx"
              />
            ) : (
              <div className="security-otp">
                <OtpInput
                  value={code}
                  onChange={(v) => {
                    setCode(v);
                    if (mfaErr) setMfaErr(null);
                  }}
                  invalid={mfaErr?.field === "code"}
                />
              </div>
            )}
            <FieldError message={mfaErr?.field === "code" ? mfaErr.msg : undefined} />
            <button
              type="button"
              className="security-link"
              onClick={() => {
                setUseBackup((b) => !b);
                setCode("");
                setMfaErr(null);
              }}
            >
              {useBackup ? "Use authenticator code" : "Use a backup code"}
            </button>
          </div>
          <div className="security-actions">
            <button
              className="btn btn-sm"
              onClick={() => {
                resetMfa();
                setMode("idle");
              }}
              disabled={mfaBusy}
            >
              Cancel
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={confirmDisable}
              disabled={mfaBusy || (useBackup ? !code.trim() : code.length < 6)}
            >
              {mfaBusy ? <Spinner /> : "Disable 2FA"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
