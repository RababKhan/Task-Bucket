"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ToastState = {
  message: string;
  variant?: "success" | "error";
} | null;

const EXIT_MS = 200;

// Bottom-right confirmation toast. Both variants dismiss themselves; errors
// linger longer so a failure isn't missed. Clicking the toast closes it early.
// It stays mounted for EXIT_MS after dismissal so the exit animation can play.
export default function Toast({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);

  // Callers pass an inline arrow, so hold it in a ref — otherwise the timer
  // effect below would restart on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      onCloseRef.current();
    }, EXIT_MS);
  }, []);

  const isError = toast?.variant === "error";

  useEffect(() => {
    if (!toast) return;
    setLeaving(false);
    const t = setTimeout(dismiss, isError ? 6500 : 3200);
    return () => clearTimeout(t);
  }, [toast, isError, dismiss]);

  if (!toast) return null;

  return (
    <div
      className={`toast${isError ? " toast-error" : ""}${leaving ? " leaving" : ""}`}
      role="status"
      aria-live="polite"
      onClick={dismiss}
    >
      {isError ? (
        <svg className="toast-ic" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path className="toast-ic-tick" d="M12 7.4v5.4M12 16.4v.01" fill="none" strokeWidth="2.3" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="toast-ic" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path className="toast-ic-tick" d="M7.7 12.3l2.8 2.8 5.8-6" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span className="toast-msg">{toast.message}</span>
    </div>
  );
}
