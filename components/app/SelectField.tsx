"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

export type SelectOption = {
  value: string;
  label: string;
  dot?: string; // optional leading color dot
  icon?: ReactNode; // optional leading icon (takes precedence over dot)
};

// A custom dropdown styled like StatusDropdown (field variant) — same look and
// behaviour (button + popup menu, viewport-aware sizing) but generic options.
export default function SelectField({
  value,
  options,
  onChange,
  placeholder = "Select",
  placeholderIcon,
  inline = false,
  iconOnly = false,
  chevron = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  placeholderIcon?: ReactNode; // leading icon shown when nothing is selected
  inline?: boolean;
  iconOnly?: boolean; // trigger shows only the icon (no label)
  chevron?: boolean; // force the chevron on an inline trigger (affordance)
}) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState(260);
  // Fixed-position coords so the menu escapes the scrolling table's clip.
  const [menuPos, setMenuPos] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // The menu is position:fixed, so it escapes any modal/table clipping and
      // is bounded only by the viewport. Always open downward — flipping up
      // covered the fields sitting above the trigger in short modals.
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      setMaxH(Math.max(120, Math.min(280, spaceBelow)));
      setMenuPos({
        position: "fixed",
        left: rect.left,
        right: "auto",
        // Inline menus size to their content (so short options don't leave a
        // gap before the check).
        minWidth: inline ? rect.width : Math.max(rect.width, 160),
        bottom: "auto",
        top: rect.bottom + 4,
      });
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
        className={`${inline ? "status-dd-inline" : "status-dd-btn"}${
          iconOnly ? " sf-icon-only" : ""
        }`}
        onClick={toggle}
        aria-label={iconOnly ? current?.label ?? placeholder : undefined}
      >
        {current?.icon
          ? current.icon
          : current?.dot
          ? <span className="sf-dot" style={{ background: current.dot }} />
          : !current && placeholderIcon
          ? placeholderIcon
          : null}
        {!iconOnly && (
          <span className="status-dd-current">
            {current ? current.label : placeholder}
          </span>
        )}
        {(!inline || chevron) && (
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
          <div className="status-dd-menu" style={menuPos}>
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
