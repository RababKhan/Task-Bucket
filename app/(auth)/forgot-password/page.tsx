"use client";

import { useState } from "react";
import Link from "next/link";
import { FormSuccess } from "@/components/StatusIcon";
import FieldError from "@/components/FieldError";
import Spinner from "@/components/Spinner";
import { validateEmail } from "@/lib/validate";
import { useAutoFocus } from "@/lib/useAutoFocus";
import Logo from "@/components/Logo";
import OtpStep from "./OtpStep";
import NewPasswordStep from "./NewPasswordStep";

type Step = "email" | "otp" | "password" | "done";

const TITLES: Record<Step, string> = {
  email: "Reset your password",
  otp: "Enter verification code",
  password: "Choose a new password",
  done: "Password updated",
};

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);
  const stepRef = useAutoFocus<HTMLDivElement>(step);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError("");
    setLoading(true);
    await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Let the send animation + loading state breathe before transitioning.
    await new Promise((r) => setTimeout(r, 650));
    setStep("otp");
    setLoading(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
        </div>

        {/* key={step} replays the fade/slide-in each time the step changes */}
        <div className="auth-step" key={step} ref={stepRef}>
          <p className="auth-title">{TITLES[step]}</p>

          {step === "email" && (
            <form className="auth-form" onSubmit={sendCode} noValidate>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError("");
                  }}
                  placeholder="you@example.com"
                  className={emailError ? "invalid" : ""}
                  aria-invalid={!!emailError || undefined}
                  aria-describedby={emailError ? "fp-email-err" : undefined}
                  required
                />
                <FieldError message={emailError} id="fp-email-err" />
                {!emailError && (
                  <div className="field-hint">
                    We&apos;ll email you a 6-digit verification code.
                  </div>
                )}
              </div>
              <button
                type="submit"
                className="btn btn-primary send-code-btn"
                disabled={loading}
              >
                <span>
                  {loading ? (
                    <>
                      Sending{" "}
                      <Spinner />
                    </>
                  ) : (
                    "Send Code"
                  )}
                </span>
                <svg
                  className={`send-plane ${loading ? "flying" : ""}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M22 2 11 13" />
                  <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
          )}

          {step === "otp" && (
            <OtpStep
              email={email}
              onVerified={(token) => {
                setResetToken(token);
                setStep("password");
              }}
              onBack={() => setStep("email")}
            />
          )}

          {step === "password" && (
            <NewPasswordStep
              resetToken={resetToken}
              onDone={() => setStep("done")}
            />
          )}

          {step === "done" && (
            <FormSuccess>
              Your password has been reset. You can now sign in with your new
              password.
            </FormSuccess>
          )}
        </div>

        <p className="auth-alt">
          <Link href="/login" className="back-link">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
