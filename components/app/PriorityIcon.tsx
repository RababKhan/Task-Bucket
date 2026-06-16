import type { TaskPriority } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/types";

// Colored flag marking a task's priority (matches the create-task dropdown).
export default function PriorityIcon({
  priority,
  size = 14,
}: {
  priority: TaskPriority;
  size?: number;
}) {
  const color = PRIORITY_COLORS[priority];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 4c3-1.6 6 1.4 12 0v8c-6 1.4-9-1.6-12 0z" fill={color} />
      <path d="M6 21V3" />
    </svg>
  );
}
