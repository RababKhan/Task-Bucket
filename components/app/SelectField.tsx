"use client";

import { useRef, useState, type ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: string;
  dot?: string; // optional leading color dot
  icon?: ReactNode; // optional leading icon (takes precedence over dot)
};

// A custom dropdown styled like StatusDropdown (field variant) — same look and
// behaviour (button + popup menu, modal-aware sizing) but generic options.
export default function SelectField({
  value,
  options,
  onChange,
  placeholder = "Select",
  inline = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState(260);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const box = triggerRef.current.closest(".modal");
      const bottomBound =
        (box ? box.getBoundingClientRect().bottom : window.innerHeight) - 12;
      const spaceBelow = bottomBound - rect.bottom - 6;
      setMaxH(Math.max(120, Math.min(280, spaceBelow)));
    }
    setOpen((o) => !o);
  }

  const current = options.find((o) => o.value === value);
  const hasGlyph = options.some((o) => o.icon || o.dot);

  return (
    <div className={`status-dd${inline ? " sf-inline" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={inline ? "status-dd-inline" : "status-dd-btn"}
        onClick={toggle}
      >
        {current?.icon
          ? current.icon
          : current?.dot && (
              <span className="sf-dot" style={{ background: current.dot }} />
            )}
        <span className="status-dd-current">
          {current ? current.label : placeholder}
        </span>
        {!inline && (
          <svg
            className={`status-dd-chevron${open ? " open" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="status-dd-backdrop" onClick={() => setOpen(false)} />
          <div className="status-dd-menu">
            <div
              className="status-dd-scroll"
              role="listbox"
              style={{ maxHeight: maxH }}
            >
              {options.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  className={`status-dd-item ${o.value === value ? "sel" : ""}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.icon ? (
                    o.icon
                  ) : o.dot ? (
                    <span className="sf-dot" style={{ background: o.dot }} />
                  ) : hasGlyph ? (
                    <span className="sf-dot sf-dot-empty" />
                  ) : null}
                  <span className="status-dd-label">{o.label}</span>
                  {o.value === value && (
                    <svg className="status-dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
