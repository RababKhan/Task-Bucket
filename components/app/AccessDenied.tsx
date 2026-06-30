"use client";

import Link from "next/link";

// Friendly panel shown when a user opens a page they don't have permission for.
// Backend routes independently reject the underlying data, so this is purely a
// clear, human-readable message (not the security boundary).
export default function AccessDenied({
  message = "You do not have permission to view this page.",
  backHref = "/projects",
  backLabel = "Back to projects",
}: {
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="access-denied">
      <div className="access-denied-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="access-denied-title">Access denied</h2>
      <p className="access-denied-msg">{message}</p>
      <Link href={backHref} className="btn btn-sm btn-primary">
        {backLabel}
      </Link>
    </div>
  );
}
