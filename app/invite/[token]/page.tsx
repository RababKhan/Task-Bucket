"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { passwordMeetsRules } from "@/lib/password";
import Logo from "@/components/Logo";
import Spinner from "@/components/Spinner";
import { CheckIcon, CrossIcon } from "@/components/StatusIcon";
import PasswordInput from "@/app/(auth)/PasswordInput";
import PasswordStrength from "@/app/(auth)/PasswordStrength";

// `reason` is the stable key from INVITE_ERROR (lib/invites.ts); `workspace_name`
// is set whenever the token matched a real invite, even one that can no longer
// be accepted, so the page can say what it was an invite *to*.
type InviteReason = "invalid" | "cancelled" | "accepted" | "expired";
type Info =
  | { error: string; reason?: InviteReason; workspace_name?: string | null }
  | {
      email: string;
      role: string;
      workspace_name: string;
      account_exists: boolean;
      project_count: number;
      message: string | null;
    };

function roleLabel(role: string) {
  return ROLE_LABELS[role as Role] ?? role;
}

// Small icons for the "can't accept this invite" states, in the same
// draw-themselves style as CheckIcon/CrossIcon (StatusIcon.tsx) — just two
// colors those don't cover.
function ClockIcon() {
  return (
    <svg
      className="status-ic status-ic-clock"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle className="ic-ring" cx="12" cy="12" r="10" />
      <path className="ic-stroke" d="M12 7v5l3 2" pathLength={26} />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg
      className="status-ic status-ic-help"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle className="ic-ring" cx="12" cy="12" r="10" />
      <path className="ic-stroke" d="M12 8v5" pathLength={26} />
      <path className="ic-stroke ic-stroke-2" d="M12 16h.01" pathLength={4} />
    </svg>
  );
}

// One panel per reason an invite can't be accepted — an icon, what happened,
// and what to do next, instead of a single bare "This invite is invalid."
function inviteStatusContent(reason: InviteReason | undefined, ws: string | null | undefined) {
  const workspace = ws ? <strong>{ws}</strong> : "this workspace";
  switch (reason) {
    case "expired":
      return {
        icon: <ClockIcon />,
        title: "This invite has expired",
        message: (
          <>Invites to {workspace} are only valid for 7 days. Ask whoever invited you to send a new one.</>
        ),
      };
    case "cancelled":
      return {
        icon: <CrossIcon />,
        title: "This invite was cancelled",
        message: (
          <>Your invite to {workspace} was cancelled by an admin. Contact them if you still need access.</>
        ),
      };
    case "accepted":
      return {
        icon: <CheckIcon />,
        title: "You're already in",
        message: (
          <>This invite to {workspace} has already been accepted. Sign in to pick up where you left off.</>
        ),
      };
    case "invalid":
    default:
      return {
        icon: <HelpIcon />,
        title: "Invite link not found",
        message: (
          <>This invite link isn&apos;t valid. Check that you copied the whole link, or ask whoever invited you to send a new one.</>
        ),
      };
  }
}

export default function InvitePage() {
  const params = useParams();
  const token = String(params.token);
  const router = useRouter();

  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => setInfo({ error: "Something went wrong." }))
      .finally(() => setLoading(false));
  }, [token]);

  // New-user accept: create account, then sign in.
  async function acceptNew(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    if (!passwordMeetsRules(password)) {
      setError("Please meet all the password requirements.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not accept the invite.");
      setSubmitting(false);
      return;
    }
    const r = await signIn("credentials", {
      email: data.email,
      password,
      redirect: false,
    });
    setSubmitting(false);
    if (r?.error) {
      router.push("/login");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  // Existing-user accept: POST; if not signed in, route to login and come back.
  async function acceptExisting() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    const res = await fetch(`/api/invite/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (res.status === 401 && data.needs_signin) {
      // Sign in, then return here to finish accepting.
      router.push(
        `/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`
      );
      return;
    }
    if (!res.ok) {
      setError(data.error || "Could not accept the invite.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const passwordsMatch = confirm.length > 0 && password === confirm;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
        </div>

        {loading ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : info && "error" in info ? (
          (() => {
            const { icon, title, message } = inviteStatusContent(
              info.reason,
              info.workspace_name
            );
            return (
              <div className="invite-status">
                <span className="invite-status-icon">{icon}</span>
                <h1 className="invite-status-title">{title}</h1>
                <p className="invite-status-msg">{message}</p>
                <Link href="/login" className="btn btn-primary invite-status-cta">
                  Go to sign in
                </Link>
              </div>
            );
          })()
        ) : info && info.account_exists ? (
          <>
            <h1 className="signup-h" style={{ textAlign: "center" }}>
              Join {info.workspace_name}
            </h1>
            <p className="signup-sub" style={{ textAlign: "center" }}>
              You&apos;ve been invited as <strong>{roleLabel(info.role)}</strong>
              {info.project_count > 0 && (
                <> with access to <strong>{info.project_count}</strong> project
                {info.project_count === 1 ? "" : "s"}</>
              )}
              . Accept with your existing account <strong>{info.email}</strong>.
            </p>
            {info.message && <p className="invite-note">“{info.message}”</p>}
            {error && <p className="invite-err">{error}</p>}
            <button
              type="button"
              className="btn btn-primary"
              onClick={acceptExisting}
              disabled={submitting}
            >
              {submitting ? <Spinner /> : "Accept invite"}
            </button>
            <p className="auth-alt">
              <Link href="/login" className="auth-link">
                Sign in with a different account
              </Link>
            </p>
          </>
        ) : info ? (
          <form className="auth-form" onSubmit={acceptNew} noValidate>
            <h1 className="signup-h" style={{ textAlign: "center" }}>
              Join {info.workspace_name}
            </h1>
            <p className="signup-sub" style={{ textAlign: "center" }}>
              You&apos;ve been invited as <strong>{roleLabel(info.role)}</strong>
              {info.project_count > 0 && (
                <> with access to <strong>{info.project_count}</strong> project
                {info.project_count === 1 ? "" : "s"}</>
              )}
              . Set up your account for <strong>{info.email}</strong>.
            </p>
            {info.message && <p className="invite-note">“{info.message}”</p>}

            <div className="field">
              <label>Your name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                placeholder="Create a password"
                autoComplete="new-password"
                required
              />
              <PasswordStrength password={password} />
            </div>

            <div className="field">
              <label>Confirm Password</label>
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
              />
              {confirm.length > 0 && (
                <div className={`match-hint ${passwordsMatch ? "ok" : "bad"}`}>
                  {passwordsMatch ? (
                    <>
                      <CheckIcon /> Passwords match
                    </>
                  ) : (
                    <>
                      <CrossIcon /> Passwords don&apos;t match
                    </>
                  )}
                </div>
              )}
            </div>

            {error && <p className="invite-err">{error}</p>}

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? (
                <>
                  Joining
                  <Spinner />
                </>
              ) : (
                "Accept invite"
              )}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
