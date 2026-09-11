"use client";

import { useState } from "react";
import type { Member, TaskStatus, TaskPriority } from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from "@/lib/types";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import PriorityIcon from "@/components/app/PriorityIcon";

// Filtering is built one field at a time. The Filter button opens the list of
// fields; choosing one opens its values. Each active field then shows as a chip
// below the toolbar, which reopens to change the selection or drops entirely.

export type FilterField = "status" | "priority" | "assignee" | "label";
export type TaskFilters = Partial<Record<FilterField, string[]>>;

const FIELDS: { key: FilterField; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "label", label: "Label" },
];

function initials(text: string) {
  const p = text.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

type Option = { value: string; label: string; icon?: React.ReactNode };

type Shared = {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  members: Member[];
  labels: string[];
};

function optionsFor(field: FilterField, members: Member[], labels: string[]): Option[] {
  switch (field) {
    case "status":
      return STATUS_ORDER.map((s) => ({
        value: s,
        label: STATUS_LABELS[s as TaskStatus],
        icon: <TaskStatusIcon status={s as TaskStatus} size={15} />,
      }));
    case "priority":
      return PRIORITY_ORDER.map((p) => ({
        value: p,
        label: PRIORITY_LABELS[p as TaskPriority],
        icon: <PriorityIcon priority={p as TaskPriority} size={14} />,
      }));
    case "assignee":
      return members.map((m) => {
        const name = m.name || m.email || "Unknown";
        return {
          value: m.user_id,
          label: name,
          icon: <span className="tf-ava">{initials(name)}</span>,
        };
      });
    case "label":
      return labels.map((l) => ({ value: l, label: l }));
  }
}

function toggleValue(
  { value, onChange }: Shared,
  field: FilterField,
  v: string
) {
  const cur = value[field] ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  // Dropping the last value drops the whole field, so no chip lingers claiming
  // to filter nothing.
  const out = { ...value };
  if (next.length) out[field] = next;
  else delete out[field];
  onChange(out);
}

/** The value list for one field, used by both the Filter button and the chips. */
function ValueList({
  field,
  shared,
  onBack,
}: {
  field: FilterField;
  shared: Shared;
  onBack?: () => void;
}) {
  const opts = optionsFor(field, shared.members, shared.labels);
  return (
    <>
      <div className="tf-menu-head">
        {onBack && (
          <button
            type="button"
            className="tf-back"
            onClick={onBack}
            aria-label="Back to fields"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {FIELDS.find((f) => f.key === field)?.label}
      </div>
      <div className="tf-values-list">
        {opts.length === 0 ? (
          <div className="tf-menu-empty">
            {field === "label" ? "No labels used yet." : "Nobody to show."}
          </div>
        ) : (
          opts.map((o) => {
            const on = (shared.value[field] ?? []).includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={`pv-filter-opt${on ? " sel" : ""}`}
                onClick={() => toggleValue(shared, field, o.value)}
              >
                {o.icon}
                <span>{o.label}</span>
                {on && (
                  <svg className="pv-filter-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/** The toolbar Filter button. Opens the field list, then that field's values. */
export function TaskFilterButton(shared: Shared) {
  const [menu, setMenu] = useState<"fields" | FilterField | null>(null);
  const count = countActiveFilters(shared.value);

  return (
    <div className="pv-sort">
      <button
        className={`pv-tool-btn${menu || count ? " active" : ""}`}
        type="button"
        onClick={() => setMenu(menu ? null : "fields")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18M7 12h10M11 18h2" />
        </svg>
        Filter
        {count > 0 && <span className="pv-sort-tag">{count}</span>}
      </button>

      {menu && (
        <>
          <div className="pv-menu-backdrop" onClick={() => setMenu(null)} />
          <div
            className={
              menu === "fields"
                ? "pv-sort-menu tf-menu"
                : "pv-sort-menu tf-menu tf-values"
            }
          >
            {menu === "fields" ? (
              FIELDS.map((f) => {
                const n = (shared.value[f.key] ?? []).length;
                return (
                  <button
                    key={f.key}
                    className={`pv-sort-item tf-field${n ? " active" : ""}`}
                    onClick={() => setMenu(f.key)}
                  >
                    {f.label}
                    {n > 0 && <span className="tf-field-count">{n}</span>}
                  </button>
                );
              })
            ) : (
              <ValueList
                field={menu}
                shared={shared}
                onBack={() => setMenu("fields")}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The row of active filter chips, shown under the toolbar. */
export function TaskFilterChips(shared: Shared) {
  const [open, setOpen] = useState<FilterField | null>(null);
  const active = FIELDS.filter((f) => (shared.value[f.key] ?? []).length > 0);
  if (active.length === 0) return null;

  function labelFor(field: FilterField, v: string) {
    return (
      optionsFor(field, shared.members, shared.labels).find((o) => o.value === v)
        ?.label ?? v
    );
  }

  function removeField(field: FilterField) {
    const out = { ...shared.value };
    delete out[field];
    shared.onChange(out);
    setOpen(null);
  }

  return (
    <div className="tf-bar">
      {active.map((f) => {
        const vals = shared.value[f.key] ?? [];
        return (
          <div key={f.key} className="tf-chip-wrap">
            <button
              type="button"
              className={`tf-chip${open === f.key ? " open" : ""}`}
              onClick={() => setOpen(open === f.key ? null : f.key)}
            >
              <span className="tf-chip-field">{f.label}</span>
              <span className="tf-chip-sep">is</span>
              <span className="tf-chip-val">
                {vals.length === 1
                  ? labelFor(f.key, vals[0])
                  : `${vals.length} selected`}
              </span>
              <svg className="tf-chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              type="button"
              className="tf-chip-x"
              aria-label={`Remove ${f.label} filter`}
              onClick={() => removeField(f.key)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            {open === f.key && (
              <>
                <div className="pv-menu-backdrop" onClick={() => setOpen(null)} />
                <div className="pv-sort-menu tf-menu tf-chip-menu tf-values">
                  <ValueList field={f.key} shared={shared} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Narrows a task list by the active filters. Fields combine with AND; the
 *  values within one field combine with OR. */
export function matchesTaskFilters(
  task: {
    status: string;
    priority: string;
    labels?: string[] | null;
    assignees?: string[] | null;
  },
  filters: TaskFilters
): boolean {
  const { status, priority, assignee, label } = filters;
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
  return true;
}

export function countActiveFilters(filters: TaskFilters): number {
  return FIELDS.reduce(
    (n, f) => n + ((filters[f.key] ?? []).length > 0 ? 1 : 0),
    0
  );
}
