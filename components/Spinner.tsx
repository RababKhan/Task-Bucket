// Three-dot loading indicator (inherits currentColor). Pair it after a verb,
// e.g. "Signing in" + <Spinner /> → "Signing in •••".
export default function Spinner({ className = "" }: { className?: string }) {
  return (
    <span className={`loading-dots ${className}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
