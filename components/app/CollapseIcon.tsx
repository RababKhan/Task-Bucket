// The app's collapse mark: a chevron in a ring. Points down while the section
// is closed and up while it is open — rotation comes from the `open` class the
// caller's stylesheet applies, so each place keeps its own size and spacing.
export default function CollapseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
    </svg>
  );
}
