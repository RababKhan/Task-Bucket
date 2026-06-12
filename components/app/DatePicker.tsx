"use client";

import { useRef, useState } from "react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sat", "Su"];
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

export default function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  inline = false,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  inline?: boolean;
}) {
  const today = new Date();
  const sel = parse(value);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState(() =>
    sel ? { y: sel.y, m: sel.m } : { y: today.getFullYear(), m: today.getMonth() }
  );

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Flip above the field if there isn't room below it.
      setDropUp(window.innerHeight - rect.bottom < 360);
      // Right-align if a left-aligned calendar would overflow its container
      // (the modal, or the viewport when not in a modal).
      const box = triggerRef.current.closest(".modal");
      const rightBound =
        (box ? box.getBoundingClientRect().right : window.innerWidth) - 10;
      setAlignRight(rect.left + 280 > rightBound);
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

  // Monday-first 6-week grid.
  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from(
    { length: 42 },
    (_, i) => new Date(view.y, view.m, 1 - offset + i)
  );

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
          <div className={`dp-cal${dropUp ? " up" : ""}${alignRight ? " right" : ""}`}>
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
                <span key={w} className="dp-wd">
                  {w}
                </span>
              ))}
            </div>

            <div className="dp-grid">
              {cells.map((d, i) => {
                const out = d.getMonth() !== view.m;
                const selected = sel && same(d, sel);
                return (
                  <button
                    key={i}
                    type="button"
                    className={`dp-day${out ? " out" : ""}${selected ? " sel" : ""}${
                      isToday(d) ? " today" : ""
                    }`}
                    onClick={() => {
                      onChange(toISO(d.getFullYear(), d.getMonth(), d.getDate()));
                      setOpen(false);
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

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
        </>
      )}
    </div>
  );
}
