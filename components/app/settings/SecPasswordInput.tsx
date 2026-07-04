"use client";

import { useState } from "react";

// Password input with a show/hide eye, self-contained (unique classes) so it
// doesn't depend on the auth-page .password-input/.pw-toggle styles.
export default function SecPasswordInput({
  value,
  onChange,
  invalid = false,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="secpw">
      <input
        type={show ? "text" : "password"}
        className={`cf-input secpw-input${invalid ? " invalid" : ""}`}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="secpw-eye"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        data-tip={show ? "Hide password" : "Show password"}
        data-tip-pos="left"
        tabIndex={-1}
      >
        {show ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <path d="M9.9 4.24 1 1m22 22-5.94-5.94M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
