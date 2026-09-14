"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/* Draws every `data-tip` tooltip in one fixed-position layer at the end of the
   body, for the same reason `.card-menu` is pinned in viewport coordinates: a
   pill drawn inside the card was clipped by the column that scrolls it. A
   scroll container clips on BOTH axes — `overflow-y: auto` computes
   `overflow-x` to `auto` too — so `.column-cards` cut the sides off an
   assignee's name even though it only meant to scroll vertically.

   The composer, editor and breadcrumb draw their own pills off the same
   attribute, so they are left alone here rather than tooltipped twice. Keep
   this list in step with the exclusions in globals.css. */
const BESPOKE =
  ".cm-action, .cm-tool, .cm-fbtn, .cm-box-send, .rte-tool, .topbar-crumb-copy";

type Side = "top" | "bottom" | "left" | "right";
const SIDES: readonly Side[] = ["top", "bottom", "left", "right"];
const FLIP: Record<Side, Side> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** Space between anchor and pill, and the margin kept clear at the viewport edge. */
const GAP = 7;
const EDGE = 8;

type Tip = { el: HTMLElement; text: string; side: Side };

/** The nearest tooltipped ancestor of an event target, or null. */
function tipFor(node: EventTarget | null): Tip | null {
  const start =
    node instanceof Element
      ? node
      : node instanceof Node
        ? node.parentElement
        : null;
  const el = start?.closest<HTMLElement>("[data-tip]");
  if (!el || el.matches(BESPOKE)) return null;
  const text = el.getAttribute("data-tip");
  if (!text) return null;
  const asked = el.getAttribute("data-tip-pos") as Side | null;
  return { el, text, side: asked && SIDES.includes(asked) ? asked : "bottom" };
}

export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [mounted, setMounted] = useState(false);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<Tip | null>(null);
  tipRef.current = tip;

  useEffect(() => setMounted(true), []);

  /* Runs before paint, so the pill is never seen at the wrong spot. */
  const place = useCallback(() => {
    const pill = pillRef.current;
    const current = tipRef.current;
    if (!pill || !current) return;
    const { el, side: want } = current;
    // The anchor can go while its tooltip is up: a card is dragged to another
    // column, a filter drops it, a route changes.
    if (!el.isConnected) {
      setTip(null);
      return;
    }
    const a = el.getBoundingClientRect();
    if (a.width === 0 && a.height === 0) {
      setTip(null);
      return;
    }

    const w = pill.offsetWidth;
    const h = pill.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const fits = (s: Side) =>
      s === "bottom"
        ? a.bottom + GAP + h <= vh - EDGE
        : s === "top"
          ? a.top - GAP - h >= EDGE
          : s === "left"
            ? a.left - GAP - w >= EDGE
            : a.right + GAP + w <= vw - EDGE;
    // Prefer the asked-for side, fall back to its opposite, else stay put and
    // let the clamp below keep the pill on screen.
    const side = fits(want) ? want : fits(FLIP[want]) ? FLIP[want] : want;

    let left: number;
    let top: number;
    if (side === "top" || side === "bottom") {
      left = a.left + a.width / 2 - w / 2;
      top = side === "bottom" ? a.bottom + GAP : a.top - GAP - h;
    } else {
      top = a.top + a.height / 2 - h / 2;
      left = side === "right" ? a.right + GAP : a.left - GAP - w;
    }
    // A long name on an element near the edge slides along rather than
    // spilling off screen.
    left = Math.min(Math.max(left, EDGE), Math.max(EDGE, vw - w - EDGE));
    top = Math.min(Math.max(top, EDGE), Math.max(EDGE, vh - h - EDGE));

    pill.style.left = `${Math.round(left)}px`;
    pill.style.top = `${Math.round(top)}px`;
  }, []);

  useLayoutEffect(place, [tip, place]);

  useEffect(() => {
    // One delegated handler covers enter, move and leave: whatever is under the
    // pointer decides the tooltip, so no anchor can be left showing one.
    const onOver = (e: Event) => {
      const next = tipFor(e.target);
      setTip((cur) => {
        if (!next) return cur ? null : cur;
        if (cur && cur.el === next.el && cur.text === next.text) return cur;
        return next;
      });
    };
    const clear = () => setTip((cur) => (cur ? null : cur));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    const onFocus = (e: Event) => {
      const next = tipFor(e.target);
      // Only keyboard focus should raise a tooltip; a click already has the
      // pointer on the element and clears on pointerdown.
      if (next && next.el.matches(":focus-visible")) setTip(next);
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseleave", clear);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("dragstart", clear, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", clear);
    document.addEventListener("keydown", onKey, true);
    // Capture, so a scroll in any nested container repositions the pill.
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place, { passive: true });
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseleave", clear);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("dragstart", clear, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", clear);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
      window.removeEventListener("blur", clear);
    };
  }, [place]);

  if (!mounted || !tip) return null;
  return createPortal(
    <div ref={pillRef} className="tip-pop" role="tooltip">
      {tip.text}
    </div>,
    document.body,
  );
}
