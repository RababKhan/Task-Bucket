"use client";

import { useEffect, useRef, useState } from "react";
import { COUNTRY_CODES, flagUrl } from "@/lib/countryCodes";

// Custom (non-native) dial-code dropdown for the phone field: app-styled trigger
// + searchable popup list. Value is the dial code (e.g. "+880").
export default function CountryCodeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = COUNTRY_CODES.find((c) => c.code === value) ?? COUNTRY_CODES[0];
  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? COUNTRY_CODES.filter(
        (c) => c.name.toLowerCase().includes(ql) || c.code.includes(ql)
      )
    : COUNTRY_CODES;

  return (
    <div className="ccs" ref={ref}>
      <button
        type="button"
        className="ccs-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="ccs-flagimg" src={flagUrl(current.iso)} alt="" width={20} height={15} />
        <span className="ccs-code">{current.code}</span>
        <svg
          className={`ccs-chev${open ? " open" : ""}`}
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
      </button>

      {open && (
        <div className="ccs-menu" role="listbox">
          <input
            autoFocus
            className="ccs-search"
            placeholder="Search country or code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="ccs-list">
            {filtered.map((c, i) => (
              <button
                type="button"
                key={`${c.name}-${i}`}
                role="option"
                aria-selected={c.code === value}
                className={`ccs-item${c.code === value ? " sel" : ""}`}
                onClick={() => {
                  onChange(c.code);
                  setOpen(false);
                  setQ("");
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="ccs-flagimg" src={flagUrl(c.iso)} alt="" width={20} height={15} />
                <span className="ccs-name">{c.name}</span>
                <span className="ccs-itemcode">{c.code}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="ccs-empty">No match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
