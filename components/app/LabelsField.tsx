"use client";

import { useState } from "react";
import { labelColor } from "@/lib/tasks";

// Inline labels editor: shows colored chips; clicking opens a popover to add
// (with suggestions) and remove labels.
export default function LabelsField({
  value,
  suggestions = [],
  onChange,
}: {
  value: string[];
  suggestions?: string[];
  onChange: (labels: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");

  function addValue(v: string) {
    const val = v.trim().slice(0, 24);
    if (!val) return;
    if (!value.some((l) => l.toLowerCase() === val.toLowerCase())) {
      onChange([...value, val].slice(0, 12));
    }
    setInput("");
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  const matches = suggestions
    .filter((s) => !value.some((l) => l.toLowerCase() === s.toLowerCase()))
    .filter((s) => s.toLowerCase().includes(input.trim().toLowerCase()))
    .slice(0, 10);

  return (
    <div className="lf">
      <button type="button" className="lf-trigger" onClick={() => setOpen(true)}>
        {value.length ? (
          value.map((l, i) => {
            const c = labelColor(l);
            return (
              <span
                key={`${l}-${i}`}
                className="tl-label-chip"
                style={{ background: c.bg, borderColor: c.border, color: c.color }}
              >
                {l}
              </span>
            );
          })
        ) : (
          <span className="tl-muted">—</span>
        )}
      </button>

      {open && (
        <>
          <div className="lf-backdrop" onClick={() => setOpen(false)} />
          <div className="lf-pop">
            <div className="tm-labels">
              {value.map((l, i) => {
                const c = labelColor(l);
                return (
                  <span
                    key={`${l}-${i}`}
                    className="tm-chip"
                    style={{ background: c.bg, borderColor: c.border, color: c.color }}
                  >
                    {l}
                    <button
                      type="button"
                      aria-label={`Remove ${l}`}
                      onClick={() => remove(i)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                );
              })}
              <input
                autoFocus
                className="tm-label-input"
                value={input}
                placeholder={value.length ? "Add" : "Type and press Enter"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addValue(input);
                  } else if (e.key === "Backspace" && !input && value.length) {
                    remove(value.length - 1);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
              />
            </div>
            {matches.length > 0 && (
              <div className="lf-suggest">
                {matches.map((s) => {
                  const c = labelColor(s);
                  return (
                    <button
                      type="button"
                      key={s}
                      className="tm-suggest-row"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addValue(s);
                      }}
                    >
                      <span
                        className="tm-chip"
                        style={{ background: c.bg, borderColor: c.border, color: c.color }}
                      >
                        {s}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
