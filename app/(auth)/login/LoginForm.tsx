"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import PasswordInput from "../PasswordInput";
import { FormError } from "@/components/StatusIcon";
import FieldError from "@/components/FieldError";
import Spinner from "@/components/Spinner";
import { validateEmail, requireValue } from "@/lib/validate";
import { useAutoFocus } from "@/lib/useAutoFocus";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const fieldErrors = {
      email: validateEmail(email),
      password: requireValue(password, "Please enter your password."),
    };
    if (fieldErrors.email || fieldErrors.password) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  const formRef = useAutoFocus<HTMLFormElement>();

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate ref={formRef}>
      {error && <FormError>{error}</FormError>}

      <div className="field">
        <label>Email</label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((p) => ({ ...p, email: "" }));
          }}
          placeholder="you@example.com"
          className={errors.email ? "invalid" : ""}
          aria-invalid={!!errors.email || undefined}
          aria-describedby={errors.email ? "login-email-err" : undefined}
          required
        />
        <FieldError message={errors.email} id="login-email-err" />
      </div>

      <div className="field">
        <div className="field-labelrow">
          <label>Password</label>
          <Link href="/forgot-password" className="auth-link forgot-inline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          autoComplete="current-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (errors.password) setErrors((p) => ({ ...p, password: "" }));
          }}
          placeholder="••••••••"
          invalid={!!errors.password}
          describedBy={errors.password ? "login-password-err" : undefined}
          required
        />
        <FieldError message={errors.password} id="login-password-err" />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? (
          <>
            Signing in
            <Spinner />
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
