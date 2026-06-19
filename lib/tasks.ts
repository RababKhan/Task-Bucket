// Shared helpers for shaping task rows into API responses and validating input.

export const TASK_TYPES = ["story", "task", "bug"] as const;
export const TASK_SEVERITIES = ["critical", "major", "moderate", "low"] as const;

// A curated set of distinct, pleasant hues for label chips.
const LABEL_HUES = [350, 18, 40, 95, 150, 185, 212, 250, 285, 320];

// Deterministic color for a label so the same text always renders the same
// color. Returns a semi-transparent tint that works in light and dark themes.
export function labelColor(label: string): {
  color: string;
  bg: string;
  border: string;
} {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) >>> 0;
  }
  const hue = LABEL_HUES[h % LABEL_HUES.length];
  return {
    color: `hsl(${hue}, 72%, 48%)`,
    bg: `hsla(${hue}, 85%, 55%, 0.20)`,
    border: `hsla(${hue}, 72%, 50%, 0.42)`,
  };
}

export function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw !== "string") return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

// Normalize a `labels` value coming from the client into a clean string[]
// (trimmed, de-duped, max 12, each <= 24 chars) for storage.
export function normalizeLabels(input: unknown): string[] {
  const arr = Array.isArray(input)
    ? input
    : typeof input === "string"
    ? input.split(",")
    : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const v = String(raw).trim().slice(0, 24);
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
    if (out.length >= 12) break;
  }
  return out;
}

// Convert a raw DB row (with `labels` JSON + optional `assignees_raw`) into the
// client-facing shape: parsed labels[] and assignees[] string ids.
export function shapeTask(
  row: Record<string, unknown> & { assignees_raw?: string | null }
): Record<string, unknown> {
  const { assignees_raw, ...rest } = row;
  return {
    ...rest,
    labels: parseLabels(rest.labels),
    assignees:
      typeof assignees_raw === "string" && assignees_raw
        ? assignees_raw.split(",")
        : [],
  };
}
