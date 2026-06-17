"use client";

import { useRef, useState, type CSSProperties } from "react";
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
  // Fixed-position coords so the popover escapes the scrolling table's clip.
  const [popPos, setPopPos] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Hover preview of the hidden labels behind the "+N" badge.
  const [hoverMore, setHoverMore] = useState(false);
  const [morePos, setMorePos] = useState<CSSProperties>({});
  const moreRef = useRef<HTMLButtonElement>(null);

  function showMore() {
    if (moreRef.current) {
      const rect = moreRef.current.getBoundingClientRect();
      const openUp = window.innerHeight - rect.bottom < 140;
      // The preview shrinks to its content, so anchor its right edge to the
      // badge (it grows leftward) instead of guessing a width — keeps it tucked
      // beside the "+N" and on screen.
      setMorePos({
        position: "fixed",
        right: Math.max(8, window.innerWidth - rect.right),
        left: "auto",
        ...(openUp
          ? { top: "auto", bottom: window.innerHeight - rect.top + 6 }
          : { bottom: "auto", top: rect.bottom + 6 }),
      });
    }
    setHoverMore(true);
  }

  function openPop() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popW = 240; // matches .lf-pop width
      const openUp =
        window.innerHeight - rect.bottom < 240 &&
        rect.top > window.innerHeight - rect.bottom;
      // Right-align if a left-aligned popover would run off the screen edge.
      const left =
        rect.left + popW > window.innerWidth - 8
          ? Math.max(8, rect.right - popW)
          : rect.left;
      setPopPos({
        position: "fixed",
        left,
        right: "auto",
        minWidth: Math.max(rect.width, 220),
        ...(openUp
          ? { top: "auto", bottom: window.innerHeight - rect.top + 4 }
          : { bottom: "auto", top: rect.bottom + 4 }),
      });
    }
    setOpen(true);
  }

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

  const trimmed = input.trim();
  const matches = suggestions
    .filter((s) => !value.some((l) => l.toLowerCase() === s.toLowerCase()))
    .filter((s) => s.toLowerCase().includes(trimmed.toLowerCase()))
    .slice(0, 10);
  const showCreate =
    trimmed.length > 0 &&
    !value.some((l) => l.toLowerCase() === trimmed.toLowerCase()) &&
    !matches.some((s) => s.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="lf">
      <button ref={triggerRef} type="button" className="lf-trigger" onClick={openPop}>
        {value.length ? (
          <span
            className="tl-label-chip"
            style={{
              background: labelColor(value[0]).bg,
              borderColor: labelColor(value[0]).border,
              color: labelColor(value[0]).color,
            }}
          >
            {value[0]}
          </span>
        ) : (
          <svg className="lf-empty-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L3 13V4a1 1 0 0 1 1-1h9l7.59 7.59a2 2 0 0 1 0 2.82Z" />
            <circle cx="7.5" cy="7.5" r="1.1" />
            <path d="M18.5 3.6v3M17 5.1h3" />
          </svg>
        )}
      </button>
      {value.length > 1 && (
        <button
          ref={moreRef}
          type="button"
          className="lf-more"
          onClick={openPop}
          onMouseEnter={showMore}
          onMouseLeave={() => setHoverMore(false)}
        >
          +{value.length - 1}
        </button>
      )}
      {hoverMore && value.length > 1 && (
        <div className="lf-more-pop" style={morePos}>
          {value.slice(1).map((l, i) => {
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
          })}
        </div>
      )}

      {open && (
        <>
          <div className="lf-backdrop" onClick={() => setOpen(false)} />
          <div className="lf-pop" style={popPos}>
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
            {(showCreate || matches.length > 0) && (
              <div className="lf-suggest">
                {showCreate && (
                  <button
                    type="button"
                    className="tm-suggest-row lf-create"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addValue(trimmed);
                    }}
                  >
                    Add &quot;{trimmed}&quot;
                  </button>
                )}
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
