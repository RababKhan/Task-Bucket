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

// A filter is built one field at a time: "Add filter" offers the fields, then
// the chosen field offers its values. Each active field becomes a chip that can
// be reopened to change the selection or dropped entirely.

export type FilterField = "status" | "priority" | "assignee" | "label";
export type TaskFilters = Partial<Record<FilterField, string[]>>;

const FIELDS: { key: FilterField; label: string; icon: React.ReactNode }[] = [
  {
    key: "status",
    label: "Status",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
  },
  {
    key: "priority",
    label: "Priority",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
      </svg>
    ),
  },
  {
    key: "assignee",
    label: "Assignee",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    key: "label",
    label: "Label",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
        <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
      </svg>
    ),
  },
];

function initials(text: string) {
  const p = text.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

type Option = { value: string; label: string; icon?: React.ReactNode };

export default function TaskFilterBar({
  value,
  onChange,
  members,
  labels,
}: {
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
  members: Member[];
  labels: string[];
}) {
  // null = closed; "fields" = picking a field; otherwise = picking that
  // field's values.
  const [menu, setMenu] = useState<"fields" | FilterField | null>(null);

  function optionsFor(field: FilterField): Option[] {
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

  function labelFor(field: FilterField, v: string): string {
    return optionsFor(field).find((o) => o.value === v)?.label ?? v;
  }

  function toggleValue(field: FilterField, v: string) {
    const cur = value[field] ?? [];
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    // Dropping the last value drops the whole field, so an empty chip never
    // lingers claiming to filter nothing.
    const out = { ...value };
    if (next.length) out[field] = next;
    else delete out[field];
    onChange(out);
  }

  function removeField(field: FilterField) {
    const out = { ...value };
    delete out[field];
    onChange(out);
    setMenu(null);
  }

  const activeFields = FIELDS.filter((f) => (value[f.key] ?? []).length > 0);
  const available = FIELDS.filter((f) => !(value[f.key] ?? []).length);

  return (
    <div className="tf-bar">
      {activeFields.map((f) => {
        const vals = value[f.key] ?? [];
        return (
          <div key={f.key} className="tf-chip-wrap">
            <button
              type="button"
              className={`tf-chip${menu === f.key ? " open" : ""}`}
              onClick={() => setMenu(menu === f.key ? null : f.key)}
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
          </div>
        );
      })}

      <div className="tf-add-wrap">
        <button
          type="button"
          className="tf-add"
          onClick={() => setMenu(menu === "fields" ? null : "fields")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Filter
        </button>

        {menu === "fields" && (
          <>
            <div className="pv-menu-backdrop" onClick={() => setMenu(null)} />
            <div className="pv-sort-menu tf-menu">
              {available.length === 0 ? (
                <div className="tf-menu-empty">Every field is already filtered.</div>
              ) : (
                available.map((f) => (
                  <button
                    key={f.key}
                    className="pv-sort-item tf-field"
                    onClick={() => setMenu(f.key)}
                  >
                    <span className="tf-field-icon">{f.icon}</span>
                    {f.label}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {menu !== null && menu !== "fields" && (
        <>
          <div className="pv-menu-backdrop" onClick={() => setMenu(null)} />
          <div
            className="pv-sort-menu tf-menu tf-values"
            // Anchored to whichever control opened it: the chip if the field is
            // already active, otherwise the Add Filter button.
            style={
              activeFields.some((f) => f.key === menu)
                ? undefined
                : { left: "auto" }
            }
          >
            <div className="tf-menu-head">
              <button
                type="button"
                className="tf-back"
                onClick={() => setMenu("fields")}
                aria-label="Back to fields"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              {FIELDS.find((f) => f.key === menu)?.label}
            </div>
            <div className="tf-values-list">
              {optionsFor(menu).length === 0 ? (
                <div className="tf-menu-empty">
                  {menu === "label" ? "No labels used yet." : "Nobody to show."}
                </div>
              ) : (
                optionsFor(menu).map((o) => {
                  const on = (value[menu] ?? []).includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`pv-filter-opt${on ? " sel" : ""}`}
                      onClick={() => toggleValue(menu, o.value)}
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
          </div>
        </>
      )}
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
