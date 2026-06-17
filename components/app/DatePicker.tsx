"use client";

import { useRef, useState, type CSSProperties } from "react";
import SelectField from "@/components/app/SelectField";

const WEEKDAYS_MON = ["Mo", "Tu", "We", "Th", "Fr", "Sat", "Su"];
const WEEKDAYS_SUN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parse(s: string) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { y, m: m - 1, d };
}

const SHORTCUTS: { label: string; days: number }[] = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "3 weeks", days: 21 },
  { label: "4 weeks", days: 28 },
];

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  inline = false,
  min,
  max,
  quick = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  inline?: boolean;
  min?: string; // earliest selectable date (ISO), inclusive
  max?: string; // latest selectable date (ISO), inclusive
  quick?: boolean; // richer calendar: shortcuts + month/year dropdowns + Done
}) {
  const today = new Date();
  const sel = parse(value);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  // Fixed-position coords so the calendar escapes the scrolling table's clip.
  const [calPos, setCalPos] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState(() =>
    sel ? { y: sel.y, m: sel.m } : { y: today.getFullYear(), m: today.getMonth() }
  );

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Match the actual calendar widths (.dp-cal.dp-pro = 370px, .dp-cal = 232px).
      const popW = quick ? 370 : 232;
      const popH = quick ? 380 : 300;
      const box = triggerRef.current.closest(".modal");
      const rightBound =
        (box ? box.getBoundingClientRect().right : window.innerWidth) - 10;
      const up = window.innerHeight - rect.bottom < popH && rect.top > popH;
      const right = rect.left + popW > rightBound;
      setDropUp(up);
      setAlignRight(right);
      const left = right
        ? Math.max(8, rect.right - popW)
        : Math.max(8, rect.left);
      setCalPos({
        position: "fixed",
        left,
        right: "auto",
        ...(up
          ? { top: "auto", bottom: window.innerHeight - rect.top + 4 }
          : { bottom: "auto", top: rect.bottom + 4 }),
      });
    }
    setOpen((o) => !o);
  }

  const label = sel
    ? new Date(sel.y, sel.m, sel.d).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  const shortLabel = sel
    ? new Date(sel.y, sel.m, sel.d).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : null;

  const first = new Date(view.y, view.m, 1);
  const offset = quick ? first.getDay() : (first.getDay() + 6) % 7;
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(view.y, view.m, 1 - offset + i)
  );
  const weekdays = quick ? WEEKDAYS_SUN : WEEKDAYS_MON;

  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const same = (d: Date, t: { y: number; m: number; d: number }) =>
    d.getFullYear() === t.y && d.getMonth() === t.m && d.getDate() === t.d;
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const inRange = (iso: string) =>
    (min == null || iso >= min) && (max == null || iso <= max);

  function pick(iso: string) {
    if (!inRange(iso)) return;
    onChange(iso);
    setOpen(false);
  }

  function offsetDate(days: number) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + days
    );
    return d;
  }

  const years = Array.from({ length: 9 }, (_, i) => today.getFullYear() - 1 + i);

  const head = (
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
  );

  const grid = (
    <>
      <div className="dp-grid dp-weekdays">
        {weekdays.map((w) => (
          <span key={w} className="dp-wd">
            {w}
          </span>
        ))}
      </div>
      <div className="dp-grid">
        {cells.map((d, i) => {
          const out = d.getMonth() !== view.m;
          const selected = sel && same(d, sel);
          const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
          const disabled = !inRange(iso);
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              className={`dp-day${out ? " out" : ""}${selected ? " sel" : ""}${
                isToday(d) ? " today" : ""
              }${disabled ? " disabled" : ""}`}
              onClick={() => pick(iso)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className={`datepicker${inline ? " dp-inline" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={inline ? "dp-inline-trigger" : "dp-trigger"}
        onClick={toggle}
      >
        {inline ? (
          sel ? (
            <>
              <svg className="pv-empty-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="6" width="13" height="13" rx="2.5" />
                <path d="M3 10h13" />
              </svg>
              <span className="dp-inline-date">{shortLabel}</span>
            </>
          ) : (
            <svg className="pv-empty-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="13" rx="2.5" />
              <path d="M3 10h13" />
              <path d="M19 15v5M16.5 17.5h5" />
            </svg>
          )
        ) : (
          <>
            <span className={label ? "" : "dp-placeholder"}>{label ?? placeholder}</span>
            <svg className="dp-cal-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="6" width="13" height="13" rx="2.5" />
              <path d="M3 10h13" />
            </svg>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="dp-backdrop" onClick={() => setOpen(false)} />

          {quick ? (
            <div className={`dp-cal dp-pro${dropUp ? " up" : ""}${alignRight ? " right" : ""}`} style={calPos}>
              <div className="dp-pro-side">
                {SHORTCUTS.map((s) => {
                  const d = offsetDate(s.days);
                  const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
                  const hint =
                    s.days <= 1
                      ? d.toLocaleDateString(undefined, { weekday: "short" })
                      : d.toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        });
                  return (
                    <button
                      key={s.label}
                      type="button"
                      className="dp-quick"
                      disabled={!inRange(iso)}
                      onClick={() => pick(iso)}
                    >
                      <span>{s.label}</span>
                      <span className="dp-quick-hint">{hint}</span>
                    </button>
                  );
                })}
              </div>

              <div className="dp-pro-main">
                <div className="dp-pro-selects">
                  <SelectField
                    value={String(view.m)}
                    options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
                    onChange={(v) => setView((s) => ({ ...s, m: Number(v) }))}
                  />
                  <SelectField
                    value={String(view.y)}
                    options={years.map((y) => ({ value: String(y), label: String(y) }))}
                    onChange={(v) => setView((s) => ({ ...s, y: Number(v) }))}
                  />
                </div>
                {head}
                {grid}
                <div className="dp-pro-actions">
                  <button
                    type="button"
                    className="dp-pro-clear"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="dp-pro-done"
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={`dp-cal${dropUp ? " up" : ""}${alignRight ? " right" : ""}`} style={calPos}>
              {head}
              {grid}
              {label && (
                <button
                  type="button"
                  className="dp-clear"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
