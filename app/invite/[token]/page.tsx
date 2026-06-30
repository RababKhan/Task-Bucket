"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { ROLE_LABELS, type Role } from "@/lib/types";
import Logo from "@/components/Logo";
import Spinner from "@/components/Spinner";

type Info =
  | { error: string }
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

export default function InvitePage() {
  const params = useParams();
  const token = String(params.token);
  const router = useRouter();

  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
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
    setSubmitting(true);
    setError("");
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
    router.push("/");
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
    router.push("/");
    router.refresh();
  }

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
          <>
            <p className="auth-title">Invite unavailable</p>
            <p className="signup-sub" style={{ textAlign: "center" }}>{info.error}</p>
            <p className="auth-alt">
              <Link href="/login" className="auth-link">
                Go to sign in
              </Link>
            </p>
          </>
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
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ chars, upper, lower, number"
                autoComplete="new-password"
                required
              />
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
