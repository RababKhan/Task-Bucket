"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormError, FormSuccess } from "@/components/StatusIcon";
import Spinner from "@/components/Spinner";

export default function ResetForm() {
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <>
        <FormError>
          This reset link is missing its token. Please request a new one.
        </FormError>
        <p className="auth-alt">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not reset password.");
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <FormSuccess>
          Your password has been reset. You can now sign in with your new
          password.
        </FormSuccess>
        <p className="auth-alt">
          <Link href="/login">Go to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      {error && <FormError>{error}</FormError>}

      <div className="field">
        <label>New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
        />
      </div>

      <div className="field">
        <label>Confirm password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Re-enter your password"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? (
          <>
            Resetting
            <Spinner />
          </>
        ) : (
          "Reset password"
        )}
      </button>
    </form>
  );
}
