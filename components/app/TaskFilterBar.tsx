"use client";

import type { Member, TaskStatus, TaskPriority } from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from "@/lib/types";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import { labelColor } from "@/lib/tasks";
import {
  FilterButton,
  FilterChips,
  PersonIcon,
  matchesDateRange,
  parseFilters,
  countActiveFilters,
  NO_FILTERS,
  type Filters,
  type FilterFieldDef,
} from "@/components/app/FilterBar";

// The task filter: the shared FilterBar configured with the fields a task has.
// Used by the project List view and by the cross-project Tasks module.

export type FilterField =
  | "project"
  | "status"
  | "priority"
  | "assignee"
  | "label"
  | "start"
  | "due";
export type TaskFilters = Filters;
export type ProjectOption = { id: number; name: string };

export { countActiveFilters, NO_FILTERS };

const FIELD_KEYS: readonly FilterField[] = [
  "project", "status", "priority", "assignee", "label", "start", "due",
];

function LabelChip({ label }: { label: string }) {
  const c = labelColor(label);
  return (
    <span
      className="tl-label-chip"
      style={{ background: c.bg, borderColor: c.border, color: c.color }}
    >
      {label}
    </span>
  );
}

type Props = {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  members: Member[];
  labels: string[];
  // Present only in cross-project lists; enables the Project field. Inside one
  // project every task shares it.
  projects?: ProjectOption[];
};

function taskFields({ members, labels, projects }: Props): FilterFieldDef[] {
  const fields: FilterFieldDef[] = [];
  if (projects?.length) {
    fields.push({
      key: "project",
      label: "Project",
      options: projects.map((p) => ({ value: String(p.id), label: p.name })),
    });
  }
  fields.push(
    {
      key: "status",
      label: "Status",
      options: STATUS_ORDER.map((s) => ({
        value: s,
        label: STATUS_LABELS[s as TaskStatus],
        icon: <TaskStatusIcon status={s as TaskStatus} size={15} />,
      })),
    },
    {
      key: "priority",
      label: "Priority",
      options: PRIORITY_ORDER.map((p) => ({
        value: p,
        label: PRIORITY_LABELS[p as TaskPriority],
        icon: <PriorityIcon priority={p as TaskPriority} size={14} />,
      })),
    },
    {
      key: "assignee",
      label: "Assignee",
      emptyText: "Nobody to show.",
      options: members.map((m) => {
        const name = m.name || m.email || "Unknown";
        return {
          value: m.user_id,
          label: name,
          icon: <PersonIcon name={name} image={m.image} />,
        };
      }),
    },
    {
      key: "label",
      label: "Label",
      emptyText: "No labels used yet.",
      // Labels render as the same coloured chip the Labels column shows.
      options: labels.map((l) => ({ value: l, label: l, node: <LabelChip label={l} /> })),
    },
    { key: "start", label: "Start Date", kind: "date" },
    { key: "due", label: "End Date", kind: "date" }
  );
  return fields;
}

export function TaskFilterButton(props: Props) {
  return <FilterButton fields={taskFields(props)} value={props.value} onChange={props.onChange} />;
}

export function TaskFilterChips(props: Props) {
  return <FilterChips fields={taskFields(props)} value={props.value} onChange={props.onChange} />;
}

export const parseTaskFilters = (raw: unknown) => parseFilters(raw, FIELD_KEYS);

/** Narrows a task list by the active filters. Fields combine with AND; the
 *  values within one field combine with OR. */
export function matchesTaskFilters(
  task: {
    project_id?: number | string | null;
    status: string;
    priority: string;
    labels?: string[] | null;
    assignees?: string[] | null;
    start_date?: string | null;
    due_date?: string | null;
  },
  filters: TaskFilters
): boolean {
  const { project, status, priority, assignee, label, start, due } = filters;
  if (project?.length && !project.includes(String(task.project_id ?? ""))) {
    return false;
  }
  if (status?.length && !status.includes(task.status)) return false;
  if (priority?.length && !priority.includes(task.priority)) return false;
  if (assignee?.length) {
    const ids = task.assignees ?? [];
    if (!assignee.some((a) => ids.includes(a))) return false;
  }
  if (label?.length) {
    const ls = task.labels ?? [];
    if (!label.some((l) => ls.includes(l))) return false;
  }
  if (start?.length && !matchesDateRange(task.start_date, start)) return false;
  if (due?.length && !matchesDateRange(task.due_date, due)) return false;
  return true;
}
