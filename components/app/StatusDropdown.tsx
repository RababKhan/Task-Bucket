"use client";

import { useRef, useState } from "react";
import type { ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_ORDER, PROJECT_STATUS_LABELS } from "@/lib/types";
import StatusIcon from "@/components/app/StatusIcon";

export default function StatusDropdown({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (s: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // ~7 rows * 36px + padding, capped at the menu max-height.
  const MENU_H = 264;

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const box = triggerRef.current.closest(".modal");
      const bottomBound =
        (box ? box.getBoundingClientRect().bottom : window.innerHeight) - 8;
      setDropUp(rect.bottom + MENU_H > bottomBound);
    }
    setOpen((o) => !o);
  }

  return (
    <div className="status-dd">
      <button
        ref={triggerRef}
        type="button"
        className="status-dd-btn"
        onClick={toggle}
      >
        <StatusIcon status={value} />
        <span className="status-dd-current">{PROJECT_STATUS_LABELS[value]}</span>
        <svg className="status-dd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="status-dd-backdrop" onClick={() => setOpen(false)} />
          <div className={`status-dd-menu${dropUp ? " up" : ""}`} role="listbox">
            {PROJECT_STATUS_ORDER.map((s) => (
              <button
                type="button"
                key={s}
                role="option"
                aria-selected={s === value}
                className={`status-dd-item ${s === value ? "sel" : ""}`}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                <StatusIcon status={s} />
                <span className="status-dd-label">{PROJECT_STATUS_LABELS[s]}</span>
                {s === value && (
                  <svg className="status-dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
