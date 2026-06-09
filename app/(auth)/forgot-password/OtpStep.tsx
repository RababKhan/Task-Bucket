"use client";

import { useEffect, useRef, useState } from "react";
import OtpInput, { type OtpInputHandle } from "../OtpInput";
import { FormError } from "@/components/StatusIcon";
import Spinner from "@/components/Spinner";
import ResendIcon from "@/components/ResendIcon";

const OTP_SECONDS = 60;

export default function OtpStep({
  email,
  onVerified,
  onBack,
}: {
  email: string;
  onVerified: (resetToken: string) => void;
  onBack: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [seconds, setSeconds] = useState(OTP_SECONDS);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Reverse countdown.
  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const expired = seconds <= 0;
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, "0");

  // When the code expires, draw the user to the Resend Code button.
  const resendRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (expired && !resending) resendRef.current?.focus();
  }, [expired, resending]);

  // After a validation error, put the cursor back in the first box.
  const otpRef = useRef<OtpInputHandle>(null);
  useEffect(() => {
    if (error && !loading && !expired) otpRef.current?.focusFirst();
  }, [error, loading, expired]);

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (otp.length !== 6 || expired || loading) return;
    setError("");
    setLoading(true);
    const res = await fetch("/api/password/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || !data.resetToken) {
      setError("Invalid verification code. Please try again.");
      setOtp("");
      return;
    }
    onVerified(data.resetToken);
  }

  async function resend() {
    if (resending) return;
    setResending(true);
    setError("");
    await fetch("/api/password/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setResending(false);
    setOtp("");
    setSeconds(OTP_SECONDS);
  }

  return (
    <form className="auth-form" onSubmit={verify}>
      <p className="otp-sent">
        Enter the 6-digit code we sent to <strong>{email}</strong>.
      </p>

      {error && <FormError key={error}>{error}</FormError>}

      <OtpInput
        ref={otpRef}
        value={otp}
        onChange={(v) => {
          setOtp(v);
          if (error) setError("");
        }}
        disabled={loading || expired}
        invalid={!!error}
      />

      <div className="otp-timer-row">
        {expired ? (
          <span className="otp-expired">
            <svg
              className="expired-ic"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5V12l3 1.8" />
            </svg>
            Code Expired
          </span>
        ) : (
          <span className="otp-expires-label">
            <svg
              className={`clock-ic ${seconds <= 10 ? "low" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
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
          onClick={resend}
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
        disabled={otp.length !== 6 || expired || loading}
      >
        {loading ? (
          <>
            Verifying
            <Spinner />
          </>
        ) : (
          "Verify Code"
        )}
      </button>

      <p className="auth-alt">
        <button
          type="button"
          className="auth-link"
          onClick={onBack}
          style={{ background: "none", padding: 0 }}
        >
          Use a different email
        </button>
      </p>
    </form>
  );
}
