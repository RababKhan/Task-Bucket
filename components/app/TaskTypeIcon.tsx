import type { TaskType } from "@/lib/types";
import { TASK_TYPE_COLORS } from "@/lib/types";

// Colored glyph identifying a task's type (Story / Task / Bug).
export default function TaskTypeIcon({
  type,
  size = 15,
}: {
  type: TaskType;
  size?: number;
}) {
  const color = TASK_TYPE_COLORS[type];
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (type === "story") {
    return (
      <svg {...common} className="tt-story">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        <path
          className="tt-story-light"
          d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"
          pathLength={100}
          stroke="#22c55e"
          strokeWidth={2.6}
        />
      </svg>
    );
  }
  if (type === "bug") {
    return (
      <svg {...common} className="tt-bug">
        <rect x="8" y="6" width="8" height="14" rx="4" />
        <path className="tt-bug-legs" d="M19 7l-2 2M5 7l2 2M3 13h3M18 13h3M5 19l2-2M19 19l-2-2M12 2v2" />
      </svg>
    );
  }
  // Task: a filled 4-point sparkle.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 1.5C12 7 7 12 1.5 12C7 12 12 17 12 22.5C12 17 17 12 22.5 12C17 12 12 7 12 1.5Z" />
    </svg>
  );
}
