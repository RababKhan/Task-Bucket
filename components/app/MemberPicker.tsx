"use client";

import { useRef, useState } from "react";
import type { Member } from "@/lib/types";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const EmptyPersonSVG = (
  <svg className="mp-empty-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="10.5" cy="8" r="3.5" strokeDasharray="1.6 2.1" />
    <path d="M4 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5" />
    <path d="M19 4.4v3.2M17.4 6h3.2" />
  </svg>
);

export default function MemberPicker({
  members,
  value,
  onChange,
  multiple = false,
  placeholder = "Select",
  allowNone = true,
  searchable = true,
  inline = false,
}: {
  members: Member[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  allowNone?: boolean;
  searchable?: boolean;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = new Set(value);
  const filtered = members.filter((m) =>
    (m.name || m.email || "").toLowerCase().includes(q.toLowerCase())
  );

  function toggle() {
    setOpen((o) => !o);
  }

  function close() {
    setOpen(false);
    setQ("");
  }

  function pick(id: string) {
    if (multiple) {
      onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
    } else {
      if (selected.has(id) && allowNone) onChange([]);
      else onChange([id]);
      close();
    }
  }

  function triggerContent() {
    if (value.length === 0) {
      return <span className="mp-placeholder">{placeholder}</span>;
    }
    if (!multiple) {
      const m = members.find((x) => x.user_id === value[0]);
      if (!m) return <span className="mp-placeholder">{placeholder}</span>;
      return (
        <span className="mp-trigger-mem">
          <span className="mp-avatar">{initials(m.name || m.email || "?")}</span>
          {m.name || m.email}
        </span>
      );
    }
    return (
      <span className="mp-trigger-mem">
        {value.length} member{value.length === 1 ? "" : "s"} selected
      </span>
    );
  }

  function inlineTrigger() {
    if (value.length === 0) return EmptyPersonSVG;
    const shown = value
      .slice(0, 3)
      .map((id) => members.find((m) => m.user_id === id))
      .filter(Boolean) as Member[];
    const extra = value.length - shown.length;
    return (
      <span className="mp-inline-avatars">
        {shown.map((m) => (
          <span key={m.user_id} className="mp-avatar stacked">
            {initials(m.name || m.email || "?")}
          </span>
        ))}
        {extra > 0 && <span className="mp-avatar more stacked">+{extra}</span>}
      </span>
    );
  }

  return (
    <div className={`mp${inline ? " mp-inline" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={inline ? "mp-inline-trigger" : "mp-trigger"}
        onClick={toggle}
      >
        {inline ? inlineTrigger() : triggerContent()}
        {!inline && (
          <svg className={`mp-chevron${open ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div className="mp-backdrop" onClick={close} />
          <div className="mp-menu">
            {searchable && (
              <div className="mp-search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  className="mp-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search…"
                  autoFocus
                />
              </div>
            )}
            <div className="mp-list">
              {filtered.length === 0 && (
                <div className="mp-empty">No members found.</div>
              )}
              {filtered.map((m) => (
                <button
                  key={m.user_id}
                  type="button"
                  className={`mp-item${selected.has(m.user_id) ? " sel" : ""}`}
                  onClick={() => pick(m.user_id)}
                >
                  <span className="mp-avatar">
                    {initials(m.name || m.email || "?")}
                  </span>
                  <span className="mp-name">{m.name || m.email}</span>
                  {selected.has(m.user_id) && (
                    <svg className="mp-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
