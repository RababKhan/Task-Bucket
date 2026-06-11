"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { passwordMeetsRules } from "@/lib/password";
import { validateEmail, requireValue } from "@/lib/validate";
import {
  WORKSPACE_DOMAIN,
  validateSubdomain,
  slugify,
} from "@/lib/subdomain";
import { useAutoFocus } from "@/lib/useAutoFocus";
import PasswordStrength from "../PasswordStrength";
import PasswordInput from "../PasswordInput";
import OtpInput, { type OtpInputHandle } from "../OtpInput";
import OAuthButtons from "../OAuthButtons";
import { CheckIcon, CrossIcon, FormError } from "@/components/StatusIcon";
import FieldError from "@/components/FieldError";
import Spinner from "@/components/Spinner";
import ResendIcon from "@/components/ResendIcon";

type SubStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "error"; message: string };

type Errors = {
  name?: string;
  workspaceName?: string;
  password?: string;
  confirm?: string;
};

const OTP_SECONDS = 60;

export default function SignupForm({
  githubEnabled,
  googleEnabled,
  step,
  setStep,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  step: 1 | 2 | 3;
  setStep: Dispatch<SetStateAction<1 | 2 | 3>>;
}) {
  const router = useRouter();

  // Step 1 — email
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);

  // Step 2 — verification
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifyToken, setVerifyToken] = useState("");
  const [seconds, setSeconds] = useState(OTP_SECONDS);
  const otpRef = useRef<OtpInputHandle>(null);
  const resendRef = useRef<HTMLButtonElement>(null);

  // Reverse countdown while on the verification step.
  useEffect(() => {
    if (step !== 2 || seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, step]);
  const expired = step === 2 && seconds <= 0;
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");

  // When the code expires, draw the user to the Resend Code button.
  useEffect(() => {
    if (expired && !resending) resendRef.current?.focus();
  }, [expired, resending]);

  // Step 3 — details
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sub, setSub] = useState<SubStatus>({ state: "idle" });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  const stepRef = useAutoFocus<HTMLDivElement>(step);
  const clearErr = (f: keyof Errors) =>
    setErrors((p) => (p[f] ? { ...p, [f]: "" } : p));

  // ---- Step 1: send the verification code ----
  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const err = validateEmail(email);
    if (err) {
      setEmailError(err);
      return;
    }
    setEmailError("");
    setSending(true);
    const res = await fetch("/api/signup/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setEmailError(data.error || "Could not send the code. Please try again.");
      return;
    }
    setOtp("");
    setOtpError("");
    setSeconds(OTP_SECONDS);
    setStep(2);
  }

  // ---- Step 2: verify the code ----
  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (otp.length !== 6 || verifying || expired) return;
    setVerifying(true);
    const res = await fetch("/api/signup/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json().catch(() => ({}));
    setVerifying(false);
    if (!res.ok || !data.verifyToken) {
      setOtpError(data.error || "Invalid verification code.");
      setOtp("");
      otpRef.current?.focusFirst();
      return;
    }
    setVerifyToken(data.verifyToken);
    setStep(3);
  }

  async function resendCode() {
    if (resending) return;
    setResending(true);
    setOtpError("");
    await fetch("/api/signup/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResending(false);
    setOtp("");
    setSeconds(OTP_SECONDS);
  }

  // ---- Step 3: subdomain availability (debounced) ----
  function onWorkspaceName(value: string) {
    setWorkspaceName(value);
    clearErr("workspaceName");
    if (!subdomainEdited) setSubdomain(slugify(value));
  }
  function onSubdomain(value: string) {
    setSubdomainEdited(true);
    setSubdomain(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }
  const reqId = useRef(0);
  useEffect(() => {
    if (step !== 3) return;
    if (!subdomain) {
      setSub({ state: "idle" });
      return;
    }
    const fmt = validateSubdomain(subdomain);
    if (fmt) {
      setSub({ state: "error", message: fmt });
      return;
    }
    setSub({ state: "checking" });
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspace/check?subdomain=${encodeURIComponent(subdomain)}`
        );
        const data = await res.json();
        if (id !== reqId.current) return;
        setSub(
          data.available
            ? { state: "available" }
            : { state: "error", message: data.error || "Unavailable." }
        );
      } catch {
        if (id === reqId.current) setSub({ state: "idle" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [subdomain, step]);

  const passwordsMatch = confirm.length > 0 && password === confirm;

  // ---- Step 3: create the account ----
  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setFormError("");

    const fieldErrors: Errors = {
      name: requireValue(name, "Please enter your full name."),
      workspaceName: requireValue(
        workspaceName,
        "Please enter a workspace name."
      ),
      password: passwordMeetsRules(password)
        ? ""
        : "Please meet all the password requirements.",
      confirm: !confirm
        ? "Please confirm your password."
        : password !== confirm
        ? "Passwords don't match."
        : "",
    };
    const subOk = sub.state === "available";
    if (!subOk) {
      const fmt = validateSubdomain(subdomain);
      setSub({
        state: "error",
        message:
          fmt ||
          (sub.state === "error"
            ? sub.message
            : "That subdomain is already taken."),
      });
    }
    if (Object.values(fieldErrors).some(Boolean) || !subOk) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});

    setCreating(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        workspaceName,
        subdomain,
        verifyToken,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFormError(data.error || "Could not create account.");
      setCreating(false);
      return;
    }
    const signInRes = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setCreating(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="signup-wizard">
      <div className="signup-progress">
        <span className="signup-step-label">Step {step} of 3</span>
        <div className="signup-segs">
          <span className={step >= 1 ? "on" : ""} />
          <span className={step >= 2 ? "on" : ""} />
          <span className={step >= 3 ? "on" : ""} />
        </div>
      </div>

      <div className="signup-step auth-step" key={step} ref={stepRef}>
        {step === 1 && (
          <form className="auth-form" onSubmit={sendCode} noValidate>
            <h1 className="signup-h">Create Your Account</h1>
            <p className="signup-sub">
              Enter your email and we&apos;ll send you a verification code.
            </p>

            {(githubEnabled || googleEnabled) && (
              <OAuthButtons
                github={githubEnabled}
                google={googleEnabled}
                label="Sign up"
              />
            )}

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
                required
              />
              <FieldError message={emailError} />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending}
            >
              {sending ? (
                <>
                  Sending
                  <Spinner />
                </>
              ) : (
                "Continue"
              )}
            </button>
          </form>
        )}

        {step === 2 && (
          <form className="auth-form" onSubmit={verifyCode} noValidate>
            <h1 className="signup-h">Check Your Email</h1>
            <p className="signup-sub">
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>

            {otpError && <FormError key={otpError}>{otpError}</FormError>}

            <OtpInput
              ref={otpRef}
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (otpError) setOtpError("");
              }}
              disabled={verifying || expired}
              invalid={!!otpError}
            />

            <div className="otp-timer-row">
              {expired ? (
                <span className="otp-expired">
                  <svg className="expired-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5V12l3 1.8" />
                  </svg>
                  Code Expired
                </span>
              ) : (
                <span className="otp-expires-label">
                  <svg className={`clock-ic ${seconds <= 10 ? "low" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="9" />
                    <line className="clock-hand" x1="12" y1="12" x2="12" y2="6.5" />
                  </svg>
                  Expires in{" "}
                  <span className={`otp-clock ${seconds <= 10 ? "low" : ""}`}>
                    {mm}:{ss}
                  </span>
                </span>
              )}
              <button
                ref={resendRef}
                type="button"
                className="auth-link otp-resend"
                disabled={!expired || resending}
                onClick={resendCode}
              >
                <ResendIcon />
                <span className="otp-resend-text">
                  {resending ? "Sending" : "Resend Code"}
                </span>
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={otp.length !== 6 || expired || verifying}
            >
              {verifying ? (
                <>
                  Verifying
                  <Spinner />
                </>
              ) : (
                "Verify & continue"
              )}
            </button>

            <p className="auth-alt">
              <button
                type="button"
                className="auth-link"
                onClick={() => setStep(1)}
              >
                Change email
              </button>
            </p>
          </form>
        )}

        {step === 3 && (
          <form className="auth-form" onSubmit={createAccount} noValidate>
            <h1 className="signup-h">Set Up Your Workspace</h1>
            <p className="signup-sub">Just a few details to finish.</p>

            {formError && <FormError>{formError}</FormError>}

            <div className="field">
              <label>Full Name</label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  clearErr("name");
                }}
                placeholder="Jane Doe"
                className={errors.name ? "invalid" : ""}
                aria-invalid={!!errors.name || undefined}
                required
              />
              <FieldError message={errors.name} />
            </div>

            <div className="field">
              <label>Workspace Name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => onWorkspaceName(e.target.value)}
                placeholder="Acme Inc"
                className={errors.workspaceName ? "invalid" : ""}
                aria-invalid={!!errors.workspaceName || undefined}
                required
              />
              <FieldError message={errors.workspaceName} />
            </div>
            <div className="field">
              <label>Workspace URL</label>
              <div
                className={`subdomain-input ${
                  sub.state === "error" ? "invalid" : ""
                }`}
              >
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => onSubdomain(e.target.value)}
                  placeholder="acme"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                />
                <span className="subdomain-suffix">.{WORKSPACE_DOMAIN}</span>
              </div>
              {sub.state !== "idle" && (
                <div className={`subdomain-status ${sub.state}`}>
                  {sub.state === "checking" && "Checking availability…"}
                  {sub.state === "available" && (
                    <>
                      <CheckIcon />
                      {subdomain}.{WORKSPACE_DOMAIN} is available
                    </>
                  )}
                  {sub.state === "error" && (
                    <>
                      <CrossIcon />
                      {sub.message}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="field">
              <label>Password</label>
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
                <FieldError message={errors.confirm} />
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={creating}
            >
              {creating ? (
                <>
                  Creating account
                  <Spinner />
                </>
              ) : (
                "Create account"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
