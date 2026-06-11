import type { ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_COLORS } from "@/lib/types";

const R = 8;
const C = 2 * Math.PI * R;

// How "full" the progress ring is for the in-flight statuses.
const PROGRESS: Partial<Record<ProjectStatus, number>> = {
  on_track: 0.7,
  at_risk: 0.5,
  off_track: 0.3,
};

export default function StatusIcon({
  status,
  size = 18,
}: {
  status: ProjectStatus;
  size?: number;
}) {
  const color = PROJECT_STATUS_COLORS[status];

  // Terminal states: filled circle with a tick / cross.
  if (status === "completed" || status === "cancelled") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill={color} />
        {status === "completed" ? (
          <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    );
  }

  // On hold: filled circle with a pause glyph.
  if (status === "on_hold") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill={color} />
        <rect x="9" y="8.3" width="2" height="7.4" rx="1" fill="#fff" />
        <rect x="13" y="8.3" width="2" height="7.4" rx="1" fill="#fff" />
      </svg>
    );
  }

  // Draft: empty ring.
  if (status === "draft") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r={R} fill="none" stroke={color} strokeWidth="2.4" />
      </svg>
    );
  }

  // On track / at risk / off track: progress ring.
  const pct = PROGRESS[status] ?? 0;
  return (
    <svg className="status-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r={R} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${pct * C} ${C}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}
