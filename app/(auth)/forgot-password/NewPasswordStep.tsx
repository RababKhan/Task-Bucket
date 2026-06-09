"use client";

import { useState } from "react";
import { passwordMeetsRules } from "@/lib/password";
import PasswordInput from "../PasswordInput";
import PasswordStrength from "../PasswordStrength";
import { CheckIcon, CrossIcon, FormError } from "@/components/StatusIcon";
import FieldError from "@/components/FieldError";
import Spinner from "@/components/Spinner";

type Errors = { password?: string; confirm?: string };

export default function NewPasswordStep({
  resetToken,
  onDone,
}: {
  resetToken: string;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const clearErr = (field: keyof Errors) =>
    setErrors((p) => (p[field] ? { ...p, [field]: "" } : p));

  const passwordsMatch = confirm.length > 0 && password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");

    const fieldErrors: Errors = {
      password: passwordMeetsRules(password)
        ? ""
        : "Please meet all the password requirements.",
      confirm: !confirm
        ? "Please confirm your password."
        : password !== confirm
        ? "Passwords don't match."
        : "",
    };
    if (fieldErrors.password || fieldErrors.confirm) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    setLoading(true);
    const res = await fetch("/api/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Could not reset password.");
      return;
    }
    onDone();
  }

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      {error && <FormError>{error}</FormError>}

      <div className="field">
        <label>New Password</label>
        <PasswordInput
          autoComplete="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            clearErr("password");
          }}
          placeholder="Create a password"
          invalid={!!errors.password}
          required
        />
        <PasswordStrength password={password} />
      </div>

      <div className="field">
        <label>Confirm Password</label>
        <PasswordInput
          autoComplete="new-password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            clearErr("confirm");
          }}
          placeholder="Re-enter your password"
          invalid={!!errors.confirm}
          describedBy={errors.confirm && !confirm ? "np-confirm-err" : undefined}
          required
        />
        {confirm.length > 0 ? (
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
        ) : (
          <FieldError message={errors.confirm} id="np-confirm-err" />
        )}
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? (
          <>
            Saving
            <Spinner />
          </>
        ) : (
          "Reset Password"
        )}
      </button>
    </form>
  );
}
