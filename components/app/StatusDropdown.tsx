"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_ORDER, PROJECT_STATUS_LABELS } from "@/lib/types";
import StatusIcon from "@/components/app/StatusIcon";

export default function StatusDropdown({
  value,
  onChange,
  variant = "field",
}: {
  value: ProjectStatus;
  onChange: (s: ProjectStatus) => void;
  variant?: "field" | "inline";
}) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState(260);
  const [fadeTop, setFadeTop] = useState(false);
  const [fadeBottom, setFadeBottom] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const box = triggerRef.current.closest(".modal");
      // Open below; cap to the room left inside the modal so it scrolls
      // internally rather than spilling past the modal edge.
      const bottomBound =
        (box ? box.getBoundingClientRect().bottom : window.innerHeight) - 12;
      const spaceBelow = bottomBound - rect.bottom - 6;
      setMaxH(Math.max(120, Math.min(280, spaceBelow)));
    }
    setOpen((o) => !o);
  }

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setFadeTop(el.scrollTop > 4);
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }

  // When opened, show the bottom fade if the list overflows.
  useEffect(() => {
    if (!open) {
      setFadeTop(false);
      setFadeBottom(false);
      return;
    }
    const el = scrollRef.current;
    if (el) setFadeBottom(el.scrollHeight > el.clientHeight + 4);
  }, [open, maxH]);

  return (
    <div className="status-dd">
      <button
        ref={triggerRef}
        type="button"
        className={variant === "inline" ? "status-dd-inline" : "status-dd-btn"}
        onClick={toggle}
      >
        <StatusIcon status={value} size={variant === "inline" ? 18 : 16} />
        <span className="status-dd-current">{PROJECT_STATUS_LABELS[value]}</span>
        {variant === "field" && (
          <svg className={`status-dd-chevron${open ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="status-dd-backdrop" onClick={() => setOpen(false)} />
          <div className="status-dd-menu">
            {fadeTop && <div className="status-dd-fade top" aria-hidden />}
            <div
              ref={scrollRef}
              className="status-dd-scroll"
              role="listbox"
              style={{ maxHeight: maxH }}
              onScroll={onScroll}
            >
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
            {fadeBottom && <div className="status-dd-fade bottom" aria-hidden />}
          </div>
        </>
      )}
    </div>
  );
}
