"use client";

import { useState, type ReactNode } from "react";

// A filter built one field at a time, shared by every table that filters: the
// project task list, the Tasks module, Projects and the Employee Directory.
//
// The Filter button opens the list of fields; choosing one opens its values
// (or, for a date field, a range calendar). Each active field then shows as a
// chip under the toolbar that reopens to change the selection or drops with
// its ✕. Values within a field combine with OR; the fields combine with AND —
// that part is up to each table's matcher, since only it knows its rows.
//
// Each table describes its fields; this file knows nothing about tasks,
// projects or people.

/** field key -> selected values. Date fields hold [from, to]. */
export type Filters = Partial<Record<string, string[]>>;

export type FilterOption = {
  value: string;
  label: string;
  /** Drawn before the label — a status dot, a priority flag, an avatar. */
  icon?: ReactNode;
  /** Replaces the label in the list, e.g. a coloured label chip. The chip
   *  under the toolbar still shows `label` as text. */
  node?: ReactNode;
};

export type FilterFieldDef = {
  key: string;
  label: string;
  /** "date" swaps the value list for a range calendar. Default "list". */
  kind?: "list" | "date";
  options?: FilterOption[];
  /** Shown when a list field has no options. */
  emptyText?: string;
};

/** A stable empty value — a fresh `{}` each render would invalidate memos. */
export const NO_FILTERS: Filters = Object.freeze({}) as Filters;

const hasValue = (vals: string[] | undefined) =>
  !!vals && vals.some((v) => v !== "");

export function countActiveFilters(filters: Filters): number {
  return Object.values(filters).filter(hasValue).length;
}

/**
 * Validate filters read back from storage against the fields a table offers.
 * Keeps only known keys holding a list of strings with a real value in it;
 * anything else is dropped, because stored data outlives the code that wrote
 * it. Returns null for a value that is not an object at all.
 */
export function parseFilters(raw: unknown, keys: readonly string[]): Filters | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const known = new Set(keys);
  const out: Filters = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!known.has(k) || !Array.isArray(v)) continue;
    const vals = v.filter((x): x is string => typeof x === "string");
    if (hasValue(vals)) out[k] = vals;
  }
  return out;
}

// ---- Dates ------------------------------------------------------------------
// A date field holds [from, to], either end possibly empty:
//   ["2026-09-12"]            a single day
//   ["2026-09-01", "09-30"]   an inclusive range
//   ["", "2026-09-30"]        on or before

export function matchesDateRange(
  date: string | null | undefined,
  range: string[] | undefined
): boolean {
  const [from = "", to = ""] = range ?? [];
  if (!from && !to) return true;
  // A row with no date cannot fall inside a range.
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
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${MON[m - 1]} ${y}`;
}

export function describeRange(range: string[]): string {
  const [from = "", to = ""] = range;
  if (from && to) return from === to ? prettyDate(from) : `${prettyDate(from)} – ${prettyDate(to)}`;
  if (from) return prettyDate(from);
  if (to) return `on or before ${prettyDate(to)}`;
  return "";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
const todayISO = () => {
  const n = new Date();
  return toISO(n.getFullYear(), n.getMonth(), n.getDate());
};

type Shared = {
  fields: FilterFieldDef[];
  value: Filters;
  onChange: (next: Filters) => void;
};

/**
 * An inline range calendar, drawn with the app's own `dp-*` calendar classes so
 * it reads as the same control the date fields use. Inline rather than the
 * DatePicker component: that opens its own popup at the same stacking level as
 * this menu (both backdrop 60 / panel 70), and nesting popups at matching
 * z-indexes is fragile.
 *
 * First click sets the start and clears any end; the next closes the range, or
 * restarts it if it lands before the start. Clicking the start again keeps it
 * a single day.
 */
function DateRange({ fieldKey, shared }: { fieldKey: string; shared: Shared }) {
  const [from = "", to = ""] = shared.value[fieldKey] ?? [];
  // Open on the month already selected, else today.
  const [ay, am] = (from || to || todayISO()).split("-").map(Number);
  const [view, setView] = useState({ y: ay, m: am - 1 });

  function set(nextFrom: string, nextTo: string) {
    const out = { ...shared.value };
    if (!nextFrom && !nextTo) delete out[fieldKey];
    else out[fieldKey] = [nextFrom, nextTo];
    shared.onChange(out);
  }

  function pick(iso: string) {
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
  const today = todayISO();

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
                (iso === today ? " today" : "")
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function toggleValue({ value, onChange }: Shared, key: string, v: string) {
  const cur = value[key] ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  // Dropping the last value drops the whole field, so no chip lingers claiming
  // to filter nothing.
  const out = { ...value };
  if (next.length) out[key] = next;
  else delete out[key];
  onChange(out);
}

/** The values for one field, used by both the Filter button and the chips. */
function ValueList({
  field,
  shared,
  onBack,
}: {
  field: FilterFieldDef;
  shared: Shared;
  onBack?: () => void;
}) {
  const opts = field.options ?? [];
  return (
    <>
      <div className="tf-menu-head">
        {onBack && (
          <button type="button" className="tf-back" onClick={onBack} aria-label="Back to fields">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {field.label}
      </div>
      <div className="tf-values-list">
        {field.kind === "date" ? (
          <DateRange fieldKey={field.key} shared={shared} />
        ) : opts.length === 0 ? (
          <div className="tf-menu-empty">{field.emptyText ?? "Nothing to show."}</div>
        ) : (
          opts.map((o) => {
            const on = (shared.value[field.key] ?? []).includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={`pv-filter-opt${on ? " sel" : ""}`}
                onClick={() => toggleValue(shared, field.key, o.value)}
              >
                {o.icon}
                <span>{o.node ?? o.label}</span>
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

/** The toolbar Filter button: the field list, then that field's values. */
export function FilterButton(shared: Shared) {
  const [menu, setMenu] = useState<string | null>(null); // null | "__fields" | key
  const count = countActiveFilters(shared.value);
  const openField = shared.fields.find((f) => f.key === menu);

  return (
    <div className="pv-sort">
      <button
        className={`pv-tool-btn${menu || count ? " active" : ""}`}
        type="button"
        onClick={() => setMenu(menu ? null : "__fields")}
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
          <div className={openField ? "pv-sort-menu tf-menu tf-values" : "pv-sort-menu tf-menu"}>
            {openField ? (
              <ValueList field={openField} shared={shared} onBack={() => setMenu("__fields")} />
            ) : (
              shared.fields.map((f) => {
                const vals = shared.value[f.key] ?? [];
                const n = f.kind === "date" ? (hasValue(vals) ? 1 : 0) : vals.length;
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
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The row of active filter chips, shown under the toolbar. */
export function FilterChips(shared: Shared) {
  const [open, setOpen] = useState<string | null>(null);
  const active = shared.fields.filter((f) => hasValue(shared.value[f.key]));
  if (active.length === 0) return null;

  function removeField(key: string) {
    const out = { ...shared.value };
    delete out[key];
    shared.onChange(out);
    setOpen(null);
  }

  return (
    <div className="tf-bar">
      {active.map((f) => {
        const vals = shared.value[f.key] ?? [];
        const labelOf = (v: string) =>
          f.options?.find((o) => o.value === v)?.label ?? v;
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
                {f.kind === "date"
                  ? describeRange(vals)
                  : vals.length === 1
                    ? labelOf(vals[0])
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
                  <ValueList field={f} shared={shared} />
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Initials for an avatar placeholder: "Rabab Khan" -> "RK". */
export function initials(text: string) {
  const p = text.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** The round avatar used in people fields: photo if there is one, else initials. */
export function PersonIcon({ name, image }: { name: string; image?: string | null }) {
  return (
    <span className="tf-ava">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" />
      ) : (
        initials(name)
      )}
    </span>
  );
}
