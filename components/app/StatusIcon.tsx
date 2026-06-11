import type { ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_COLORS } from "@/lib/types";

// Donut geometry for a 16x16 icon.
const R = 5.5;
const SW = 3;
const C = 2 * Math.PI * R;

// Fill fraction of the progress donut for the in-flight statuses.
const PROGRESS: Record<string, number> = {
  draft: 0,
  on_track: 0.7,
  at_risk: 0.5,
  off_track: 0.25,
};

export default function StatusIcon({
  status,
  size = 16,
}: {
  status: ProjectStatus;
  size?: number;
}) {
  const color = PROJECT_STATUS_COLORS[status];

  // Terminal states: filled circle with a tick / cross.
  if (status === "completed" || status === "cancelled") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill={color} />
        {status === "completed" ? (
          <path d="M4.8 8.2l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  }

  // On hold: filled circle with a pause glyph.
  if (status === "on_hold") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill={color} />
        <rect x="5.7" y="5" width="1.5" height="6" rx="0.6" fill="#fff" />
        <rect x="8.8" y="5" width="1.5" height="6" rx="0.6" fill="#fff" />
      </svg>
    );
  }

  // Draft / on track / at risk / off track: two-tone progress donut.
  const pct = PROGRESS[status] ?? 0;
  return (
    <svg className="status-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r={R} fill="none" stroke={color} strokeOpacity={pct > 0 ? 0.28 : 0.7} strokeWidth={SW} />
      {pct > 0 && (
        <circle
          cx="8"
          cy="8"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={SW}
          strokeDasharray={`${pct * C} ${C}`}
          transform="rotate(-90 8 8)"
        />
      )}
    </svg>
  );
}
