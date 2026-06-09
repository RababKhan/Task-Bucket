// Task Bucket wordmark. The bars keep their gray shades; the wordmark text
// uses currentColor so it adapts to light/dark themes.
export default function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`tb-logo ${className}`}
      viewBox="0 0 248 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Task Bucket"
    >
      <rect x="10" y="15" width="40" height="8" rx="4" fill="#3f3f46" />
      <rect x="10" y="28" width="29" height="8" rx="4" fill="#71717a" />
      <rect x="10" y="41" width="19" height="8" rx="4" fill="#a1a1aa" />
      <text
        x="66"
        y="41"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="26"
        fontWeight="500"
        letterSpacing="-0.5"
        fill="currentColor"
      >
        Task Bucket
      </text>
    </svg>
  );
}
