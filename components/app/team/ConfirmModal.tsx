"use client";

import { useEffect, useState, type ReactNode } from "react";
import Spinner from "@/components/Spinner";

// Generic confirmation modal for destructive actions (deactivate / remove).
// Mirrors the delete-project dialog: warning icon, bolded subject in the body,
// and a "keep" primary button so the safe choice is the emphasised one.
export default function ConfirmModal({
  title,
  body,
  confirmLabel = "Yes, Delete it",
  cancelLabel = "No, Keep it",
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal confirm-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="confirm-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </span>

        <h2>{title}</h2>
        <p className="confirm-text">{body}</p>

        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-primary confirm-keep"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-outline confirm-del"
            onClick={run}
            disabled={busy}
          >
            {busy ? <Spinner /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
