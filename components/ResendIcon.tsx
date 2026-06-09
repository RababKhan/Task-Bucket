// Stacked up-chevrons in the Task Bucket logo grays. They continuously light up
// in sequence (top -> bottom) to form an upward wave.
export default function ResendIcon() {
  return (
    <svg
      className="resend-ic"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path className="chev chev-1" d="M5 8 L12 4 L19 8" stroke="#a1a1aa" />
      <path className="chev chev-2" d="M5 14 L12 10 L19 14" stroke="#71717a" />
      <path className="chev chev-3" d="M5 20 L12 16 L19 20" stroke="#3f3f46" />
    </svg>
  );
}
