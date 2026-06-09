// Shared, animated status icons + message boxes used app-wide for inline
// validation feedback. The SVG strokes "draw" themselves in via CSS.

export function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`status-ic status-ic-check ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle className="ic-ring" cx="12" cy="12" r="10" />
      <path className="ic-stroke" d="M7 12.5l3.2 3.2L17 8.8" />
    </svg>
  );
}

export function CrossIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`status-ic status-ic-cross ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle className="ic-ring" cx="12" cy="12" r="10" />
      <path className="ic-stroke" d="M15.5 8.5l-7 7" />
      <path className="ic-stroke ic-stroke-2" d="M8.5 8.5l7 7" />
    </svg>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <div className="form-error" role="alert">
      <CrossIcon />
      <span>{children}</span>
    </div>
  );
}

export function FormSuccess({ children }: { children: React.ReactNode }) {
  return (
    <div className="form-success">
      <CheckIcon />
      <span>{children}</span>
    </div>
  );
}
