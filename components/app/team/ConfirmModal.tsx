"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";

// Generic confirmation modal for destructive actions (deactivate / remove).
export default function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
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
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? "btn-danger-solid" : "btn-primary"}`}
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
