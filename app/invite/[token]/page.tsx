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
      role: Role;
      workspace_name: string;
      account_exists: boolean;
    };

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

  async function accept(e: React.FormEvent) {
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
            <p className="auth-title">You already have an account</p>
            <p className="signup-sub" style={{ textAlign: "center" }}>
              Sign in with <strong>{info.email}</strong> to access{" "}
              {info.workspace_name}.
            </p>
            <p className="auth-alt">
              <Link href="/login" className="auth-link">
                Go to sign in
              </Link>
            </p>
          </>
        ) : info ? (
          <form className="auth-form" onSubmit={accept} noValidate>
            <h1 className="signup-h" style={{ textAlign: "center" }}>
              Join {info.workspace_name}
            </h1>
            <p className="signup-sub" style={{ textAlign: "center" }}>
              You&apos;ve been invited as <strong>{ROLE_LABELS[info.role]}</strong>.
              Set up your account for <strong>{info.email}</strong>.
            </p>

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
