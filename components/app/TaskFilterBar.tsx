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
import { labelColor } from "@/lib/tasks";

// Filtering is built one field at a time. The Filter button opens the list of
// fields; choosing one opens its values. Each active field then shows as a chip
// below the toolbar, which reopens to change the selection or drops entirely.

export type FilterField =
  | "status"
  | "priority"
  | "assignee"
  | "label"
  | "start"
  | "due";
export type TaskFilters = Partial<Record<FilterField, string[]>>;

const FIELDS: { key: FilterField; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "label", label: "Label" },
  { key: "start", label: "Start Date" },
  { key: "due", label: "End Date" },
];

// Date fields hold [from, to]. Either end may be empty:
//   ["2026-09-12"]           a single day
//   ["2026-09-01", "09-30"]  an inclusive range
//   ["", "2026-09-30"]       on or before
const DATE_FIELDS: FilterField[] = ["start", "due"];
const isDateField = (f: FilterField) => DATE_FIELDS.includes(f);

function matchesDateRange(
  date: string | null | undefined,
  range: string[]
): boolean {
  const [from = "", to = ""] = range;
  if (!from && !to) return true;
  // A task with no date cannot fall inside a range.
  const d = (date ?? "").slice(0, 10);
  if (!d) return false;
  if (from && to) return d >= from && d <= to;
  if (from) return d === from;
  return d <= to;
}

/** "12 Sep 2026" — short, unambiguous, and locale-independent. */
function prettyDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function describeRange(range: string[]): string {
  const [from = "", to = ""] = range;
  if (from && to) return from === to ? prettyDate(from) : `${prettyDate(from)} – ${prettyDate(to)}`;
  if (from) return prettyDate(from);
  if (to) return `on or before ${prettyDate(to)}`;
  return "";
}

function initials(text: string) {
  const p = text.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// A value row is normally an icon plus its label. Labels instead render as the
// same coloured chip the Labels column shows, so a label is recognisable here
// by the colour you already associate with it.
type Option = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  chip?: boolean;
};

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
          icon: (
            <span className="tf-ava">
              {m.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="" />
              ) : (
                initials(name)
              )}
            </span>
          ),
        };
      });
    case "label":
      return labels.map((l) => ({ value: l, label: l, chip: true }));
    // Date fields are picked, not listed.
    case "start":
    case "due":
      return [];
  }
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/**
 * An inline range calendar, drawn with the app's own `dp-*` calendar classes so
 * it reads as the same control the date fields use. Inline rather than the
 * DatePicker component itself: that opens its own popup at the same stacking
 * level as this menu (both backdrop 60 / panel 70), and a popup inside a popup
 * at matching z-indexes is a fight not worth picking.
 *
 * First click sets the start and clears any end; the next click closes the
 * range, or restarts it if it lands before the start. Clicking the start again
 * keeps it as a single day.
 */
function DateRange({ field, shared }: { field: FilterField; shared: Shared }) {
  const [from = "", to = ""] = shared.value[field] ?? [];

  // Open on the month already selected, else today.
  const anchor = from || to || toISO(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );
  const [ay, am] = anchor.split("-").map(Number);
  const [view, setView] = useState({ y: ay, m: am - 1 });

  function set(nextFrom: string, nextTo: string) {
    const out = { ...shared.value };
    if (!nextFrom && !nextTo) delete out[field];
    else out[field] = [nextFrom, nextTo];
    shared.onChange(out);
  }

  function pick(iso: string) {
    // A completed range (or nothing yet) starts a new one.
    if (!from || (from && to)) return set(iso, "");
    if (iso < from) return set(iso, "");
    set(from, iso === from ? "" : iso);
  }

  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7; // weeks start Monday
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(view.y, view.m, 1 - offset + i)
  );
  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const todayISO = toISO(
    new Date().getFullYear(),
    new Date().getMonth(),
    new Date().getDate()
  );

  return (
    <div className="tf-cal">
      <div className="dp-head">
        <button type="button" className="dp-nav" onClick={() => shift(-1)} aria-label="Previous month">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="dp-title">
          {MONTHS[view.m]} {view.y}
        </span>
        <button type="button" className="dp-nav" onClick={() => shift(1)} aria-label="Next month">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="dp-grid dp-weekdays">
        {WEEKDAYS.map((w) => (
          <span key={w} className="dp-wd">{w}</span>
        ))}
      </div>
      <div className="dp-grid">
        {cells.map((d, i) => {
          const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
          const out = d.getMonth() !== view.m;
          const isFrom = !!from && iso === from;
          const isTo = !!to && iso === to;
          const inside = !!from && !!to && iso > from && iso < to;
          return (
            <button
              key={i}
              type="button"
              className={
                "dp-day" +
                (out ? " out" : "") +
                (isFrom || isTo ? " sel" : "") +
                (inside ? " tf-in-range" : "") +
                (isFrom && to ? " tf-range-start" : "") +
                (isTo ? " tf-range-end" : "") +
                (iso === todayISO ? " today" : "")
              }
              onClick={() => pick(iso)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="tf-cal-foot">
        <span className="tf-cal-read">
          {from || to
            ? describeRange([from, to])
            : "Pick a day, or a second to make a range"}
        </span>
        {(from || to) && (
          <button type="button" className="tf-cal-clear" onClick={() => set("", "")}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
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
        {isDateField(field) ? (
          <DateRange field={field} shared={shared} />
        ) : opts.length === 0 ? (
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
                <span>{o.chip ? <LabelChip label={o.label} /> : o.label}</span>
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
                    <span className="tf-field-right">
                      {n > 0 && <span className="tf-field-count">{n}</span>}
                      {/* Signals that the row opens a further list rather than
                          applying something on the spot. */}
                      <svg className="tf-field-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
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
                {isDateField(f.key)
                  ? describeRange(vals)
                  : vals.length === 1
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
    start_date?: string | null;
    due_date?: string | null;
  },
  filters: TaskFilters
): boolean {
  const { status, priority, assignee, label, start, due } = filters;
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

export function countActiveFilters(filters: TaskFilters): number {
  return FIELDS.reduce(
    (n, f) => n + ((filters[f.key] ?? []).length > 0 ? 1 : 0),
    0
  );
}
