"use client";

import { useState } from "react";
import type { ProjectStatus } from "@/lib/types";
import {
  PROJECT_STATUS_ORDER,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_COLORS,
} from "@/lib/types";

export default function StatusDropdown({
  value,
  onChange,
}: {
  value: ProjectStatus;
  onChange: (s: ProjectStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="status-dd">
      <button
        type="button"
        className="status-dd-btn"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="status-dot"
          style={{ background: PROJECT_STATUS_COLORS[value] }}
        />
        <span className="status-dd-current">{PROJECT_STATUS_LABELS[value]}</span>
        <svg className="status-dd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="status-dd-backdrop" onClick={() => setOpen(false)} />
          <div className="status-dd-menu" role="listbox">
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
                <span
                  className="status-dot"
                  style={{ background: PROJECT_STATUS_COLORS[s] }}
                />
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
