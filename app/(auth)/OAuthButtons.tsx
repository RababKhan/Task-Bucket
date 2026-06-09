"use client";

import { signIn } from "next-auth/react";

export default function OAuthButtons({
  github,
  google,
  label,
}: {
  github: boolean;
  google: boolean;
  label: string; // e.g. "Sign in" / "Sign up"
}) {
  if (!github && !google) {
    return (
      <p className="field-hint" style={{ textAlign: "center", marginBottom: 16 }}>
        Social login isn&apos;t configured yet. Add OAuth credentials to
        <code> .env.local</code> to enable Google / GitHub.
      </p>
    );
  }

  return (
    <>
      <div className="oauth-buttons">
        {google && (
          <button
            type="button"
            className="oauth-btn"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
              />
            </svg>
            {label} with Google
          </button>
        )}
        {github && (
          <button
            type="button"
            className="oauth-btn"
            onClick={() => signIn("github", { callbackUrl: "/" })}
          >
            <svg viewBox="0 0 24 24" aria-hidden fill="currentColor">
              <path d="M12 1A11 11 0 0 0 8.52 22.45c.55.1.75-.24.75-.53v-1.85c-3.06.67-3.7-1.47-3.7-1.47-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.69 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.47-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.4 10.4 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.75 1.13 2.95 0 4.23-2.58 5.16-5.03 5.43.4.34.74 1 .74 2.03v3c0 .3.2.64.76.53A11 11 0 0 0 12 1Z" />
            </svg>
            {label} with GitHub
          </button>
        )}
      </div>
      <div className="divider">OR</div>
    </>
  );
}
