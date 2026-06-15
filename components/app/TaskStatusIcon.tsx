import type { TaskStatus } from "@/lib/types";
import { STATUS_COLORS } from "@/lib/types";

// Donut geometry for a 16x16 icon — mirrors the project StatusIcon style.
const R = 5.5;
const SW = 3;
const C = 2 * Math.PI * R;

// How far along the pipeline each stage is, used as the progress-donut fill.
const PROGRESS: Record<TaskStatus, number> = {
  backlog: 0,
  dev_in_progress: 0.2,
  dev_done: 0.38,
  in_test: 0.5,
  test_in_progress: 0.62,
  test_fail: 0,
  test_done: 0.8,
  ready_for_deploy: 0.92,
  done: 1,
};

export default function TaskStatusIcon({
  status,
  size = 16,
}: {
  status: TaskStatus;
  size?: number;
}) {
  const color = STATUS_COLORS[status];

  // Terminal success: filled circle with a tick.
  if (status === "done") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill={color} />
        <path d="M4.8 8.2l2.1 2.1 4.3-4.6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // Test failed: filled circle with a cross.
  if (status === "test_fail") {
    return (
      <svg className="status-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="7" fill={color} />
        <path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // In-flight stages: two-tone progress donut.
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
