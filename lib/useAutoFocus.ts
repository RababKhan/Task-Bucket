"use client";

import { useEffect, useRef } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isEligible(el: Field): boolean {
  if (el.disabled) return false;
  if ((el as HTMLInputElement).readOnly) return false;
  if ((el as HTMLInputElement).type === "hidden") return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  if (el.tabIndex < 0) return false;
  // visible? (display:none / not rendered → no box)
  if (el.offsetParent === null && el.getClientRects().length === 0) return false;
  return true;
}

function focusFirstField(root: HTMLElement | null) {
  if (!root) return;
  const fields = root.querySelectorAll<Field>("input, textarea, select");
  for (const el of Array.from(fields)) {
    if (!isEligible(el)) continue;
    el.focus();
    // If it's pre-filled, place the caret at the end (not select-all).
    const value = (el as HTMLInputElement).value;
    if (value) {
      try {
        const len = value.length;
        (el as HTMLInputElement).setSelectionRange?.(len, len);
      } catch {
        // some input types (email, date, number) don't support selection
      }
    }
    return;
  }
}

/**
 * Auto-focus the first eligible field inside a container when it mounts (or
 * when `dep` changes — e.g. a wizard step). Returns a ref to attach to the
 * form / modal / step container.
 */
export function useAutoFocus<T extends HTMLElement = HTMLElement>(dep?: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    // Defer one frame so the DOM has painted (modals, step transitions, etc.).
    const id = requestAnimationFrame(() => focusFirstField(ref.current));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return ref;
}
