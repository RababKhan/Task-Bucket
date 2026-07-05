"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Branding = {
  name: string;
  logo: string;
  favicon: string;
  colorDark: string;
  colorLight: string;
};

const EMPTY: Branding = {
  name: "",
  logo: "",
  favicon: "",
  colorDark: "",
  colorLight: "",
};
const CACHE_KEY = "tb-branding";

const BrandingCtx = createContext<{
  branding: Branding;
  refresh: () => void;
}>({ branding: EMPTY, refresh: () => {} });

export function useBranding() {
  return useContext(BrandingCtx);
}

// ---- color helpers (mix toward white/black; translucent ring) ----
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b]
      .map((x) =>
        Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")
      )
      .join("")
  );
}
// percent > 0 lightens, < 0 darkens.
function adjust(hex: string, percent: number) {
  const [r, g, b] = hexToRgb(hex);
  const p = Math.abs(percent) / 100;
  const t = percent > 0 ? 255 : 0;
  return toHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}
function ring(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, 0.32)`;
}

function applyColors(b: Branding) {
  if (typeof document === "undefined") return;
  let el = document.getElementById("brand-vars") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "brand-vars";
    document.head.appendChild(el);
  }
  const rules: string[] = [];
  if (b.colorDark) {
    rules.push(
      `:root[data-theme="dark"]{--accent:${b.colorDark};--accent-hover:${adjust(
        b.colorDark,
        14
      )};--ring:${ring(b.colorDark)};}`
    );
  }
  if (b.colorLight) {
    rules.push(
      `:root[data-theme="light"]{--accent:${b.colorLight};--accent-hover:${adjust(
        b.colorLight,
        -10
      )};--ring:${ring(b.colorLight)};}`
    );
  }
  el.textContent = rules.join("");
}

function applyFavicon(favicon: string) {
  if (typeof document === "undefined") return;
  let link = document.getElementById("brand-favicon") as HTMLLinkElement | null;
  if (!favicon) {
    // Cleared — drop the override so the app's default favicon applies.
    if (link) link.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.id = "brand-favicon";
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = favicon;
}

export default function BrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [branding, setBranding] = useState<Branding>(EMPTY);

  // Instant hydrate from cache (avoids a flash of default branding), then apply.
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const b = { ...EMPTY, ...JSON.parse(cached) } as Branding;
        setBranding(b);
        applyColors(b);
        applyFavicon(b.favicon);
      }
    } catch {}
  }, []);

  const refresh = useCallback(() => {
    fetch("/api/workspace/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const b = { ...EMPTY, ...d } as Branding;
        setBranding(b);
        applyColors(b);
        applyFavicon(b.favicon);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(b));
        } catch {}
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <BrandingCtx.Provider value={{ branding, refresh }}>
      {children}
    </BrandingCtx.Provider>
  );
}
