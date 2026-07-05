"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import FieldError from "@/components/FieldError";
import { useBranding } from "@/components/app/BrandingProvider";

// Theme defaults must match globals.css (:root dark, [data-theme="light"]).
const DEFAULT_DARK = "#1f6feb";
const DEFAULT_LIGHT = "#44403c";

// Rasterize a bitmap logo to fit 128px (keeps SVGs as-is to preserve vectors).
function fileToLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (file.type === "image/svg+xml") {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = document.createElement("img");
      img.onload = () => {
        const max = 128;
        const scale = Math.min(max / img.width, max / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// Center-crop to a square 64px favicon (keeps SVG/ICO as-is).
function fileToFavicon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    if (file.type === "image/svg+xml" || file.type.includes("icon")) {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("read failed"));
      reader.readAsDataURL(file);
      return;
    }
    reader.onload = () => {
      const img = document.createElement("img");
      img.onload = () => {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

type Form = {
  name: string;
  logo: string;
  favicon: string;
  colorDark: string;
  colorLight: string;
};
const EMPTY: Form = {
  name: "",
  logo: "",
  favicon: "",
  colorDark: "",
  colorLight: "",
};

function ColorField({
  value,
  onChange,
  defaultColor,
}: {
  value: string;
  onChange: (v: string) => void;
  defaultColor: string;
}) {
  return (
    <div className="brand-color">
      <input
        type="color"
        className="brand-color-swatch"
        value={value || defaultColor}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Pick color"
      />
      <input
        className="cf-input brand-color-hex"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={defaultColor}
      />
      {value && (
        <button
          type="button"
          className="brand-color-reset"
          data-tip="Reset to default"
          onClick={() => onChange("")}
        >
          Reset
        </button>
      )}
    </div>
  );
}

export default function BrandingCard() {
  const { refresh } = useBranding();
  const [original, setOriginal] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [ok, setOk] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch("/api/workspace/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          const v: Form = {
            name: d.name || "",
            logo: d.logo || "",
            favicon: d.favicon || "",
            colorDark: d.colorDark || "",
            colorLight: d.colorLight || "",
          };
          setOriginal(v);
          setForm(v);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const dirty = JSON.stringify(form) !== JSON.stringify(original);
  const errFor = (f: string) => (err?.field === f ? err.msg : undefined);

  function startEdit() {
    setForm(original);
    setErr(null);
    setEditing(true);
  }
  function cancel() {
    setForm(original);
    setErr(null);
    setEditing(false);
  }

  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr({ field: "logo", msg: "Please choose an image file." });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr({ field: "logo", msg: "Logo must be under 2 MB." });
      return;
    }
    try {
      const logo = await fileToLogo(file);
      setForm((f) => ({ ...f, logo }));
      setErr((e) => (e?.field === "logo" ? null : e));
    } catch {
      setErr({ field: "logo", msg: "Could not read that image." });
    }
  }

  async function pickFavicon(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr({ field: "favicon", msg: "Please choose an image file." });
      return;
    }
    if (file.size > 1024 * 1024) {
      setErr({ field: "favicon", msg: "Favicon must be under 1 MB." });
      return;
    }
    try {
      const favicon = await fileToFavicon(file);
      setForm((f) => ({ ...f, favicon }));
      setErr((e) => (e?.field === "favicon" ? null : e));
    } catch {
      setErr({ field: "favicon", msg: "Could not read that image." });
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/workspace/branding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr({ field: d.field || "name", msg: d.error || "Could not save." });
      return;
    }
    setOriginal(form);
    setEditing(false);
    refresh(); // re-apply branding across the app
    setOk(true);
    setTimeout(() => setOk(false), 2500);
  }

  if (!loaded) {
    return (
      <div className="settings-card">
        <div className="page-loading">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <div className="profile-headinfo">
          <div className="settings-card-title">Branding</div>
          <div className="security-desc">
            {ok
              ? "Branding updated."
              : "Customize the app name, logo, and primary color your team sees."}
          </div>
        </div>
        {!editing ? (
          <button className="btn btn-sm profile-edit-btn" onClick={startEdit}>
            Edit
          </button>
        ) : (
          <div className="profile-edit-actions">
            <button className="btn btn-sm" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            <span
              className="profile-update-wrap"
              data-tip={!dirty && !saving ? "No changes to save" : undefined}
            >
              <button
                className="btn btn-sm btn-primary"
                onClick={save}
                disabled={saving || !dirty}
              >
                {saving ? <Spinner /> : "Save"}
              </button>
            </span>
          </div>
        )}
      </div>

      {!editing ? (
        <>
        <div className="brand-view-top">
          <div className="settings-field">
            <label>App name</label>
            <div className="settings-value">{original.name || "Task Bucket"}</div>
          </div>
          <div className="brand-logo-pair">
          <div className="settings-field">
            <label>Logo</label>
            <span className="brand-logo-preview">
              {original.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={original.logo} alt="" />
              ) : (
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <rect x="2" y="7" width="36" height="7" rx="3.5" fill="#3f3f46" />
                  <rect x="2" y="17" width="26" height="7" rx="3.5" fill="#71717a" />
                  <rect x="2" y="27" width="17" height="7" rx="3.5" fill="#a1a1aa" />
                </svg>
              )}
            </span>
          </div>
          <div className="settings-field">
            <label>Favicon</label>
            <span className="brand-logo-preview">
              {original.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={original.favicon} alt="" />
              ) : (
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <rect x="2" y="7" width="36" height="7" rx="3.5" fill="#3f3f46" />
                  <rect x="2" y="17" width="26" height="7" rx="3.5" fill="#71717a" />
                  <rect x="2" y="27" width="17" height="7" rx="3.5" fill="#a1a1aa" />
                </svg>
              )}
            </span>
          </div>
          </div>
        </div>
        <div className="settings-grid">
          <div className="settings-field">
            <label>Primary color · Dark mode</label>
            <div className="brand-view-color">
              <span
                className="brand-view-swatch"
                style={{ background: original.colorDark || DEFAULT_DARK }}
              />
              {original.colorDark || DEFAULT_DARK}
            </div>
          </div>
          <div className="settings-field">
            <label>Primary color · Light mode</label>
            <div className="brand-view-color">
              <span
                className="brand-view-swatch"
                style={{ background: original.colorLight || DEFAULT_LIGHT }}
              />
              {original.colorLight || DEFAULT_LIGHT}
            </div>
          </div>
        </div>
        </>
      ) : (
      <div className="brand-fields">
        <div className="settings-field">
          <label>App name</label>
          <input
            className="cf-input brand-name-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Task Bucket"
            maxLength={40}
          />
        </div>

        <div className="settings-field">
          <label>Logo</label>
          <div className="brand-logo-row">
            <span className="brand-logo-preview">
              {form.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo} alt="" />
              ) : (
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <rect x="2" y="7" width="36" height="7" rx="3.5" fill="#3f3f46" />
                  <rect x="2" y="17" width="26" height="7" rx="3.5" fill="#71717a" />
                  <rect x="2" y="27" width="17" height="7" rx="3.5" fill="#a1a1aa" />
                </svg>
              )}
            </span>
            <input
              id="brand-logo-file"
              type="file"
              accept="image/*"
              hidden
              onChange={pickLogo}
            />
            <label htmlFor="brand-logo-file" className="btn btn-sm brand-upload">
              Upload logo
            </label>
            {form.logo && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setForm((f) => ({ ...f, logo: "" }))}
              >
                Remove
              </button>
            )}
          </div>
          <FieldError message={errFor("logo")} />
        </div>

        <div className="settings-field">
          <label>Favicon</label>
          <div className="brand-logo-row">
            <span className="brand-logo-preview">
              {form.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.favicon} alt="" />
              ) : (
                <svg viewBox="0 0 40 40" fill="none" aria-hidden>
                  <rect x="2" y="7" width="36" height="7" rx="3.5" fill="#3f3f46" />
                  <rect x="2" y="17" width="26" height="7" rx="3.5" fill="#71717a" />
                  <rect x="2" y="27" width="17" height="7" rx="3.5" fill="#a1a1aa" />
                </svg>
              )}
            </span>
            <input
              id="brand-favicon-file"
              type="file"
              accept="image/*"
              hidden
              onChange={pickFavicon}
            />
            <label
              htmlFor="brand-favicon-file"
              className="btn btn-sm brand-upload"
            >
              Upload favicon
            </label>
            {form.favicon && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setForm((f) => ({ ...f, favicon: "" }))}
              >
                Remove
              </button>
            )}
          </div>
          <FieldError message={errFor("favicon")} />
        </div>

        <div className="brand-colors">
          <div className="settings-field">
            <label>Primary color · Dark mode</label>
            <ColorField
              value={form.colorDark}
              defaultColor={DEFAULT_DARK}
              onChange={(v) => {
                setForm((f) => ({ ...f, colorDark: v }));
                if (err?.field === "colorDark") setErr(null);
              }}
            />
            <FieldError message={errFor("colorDark")} />
          </div>
          <div className="settings-field">
            <label>Primary color · Light mode</label>
            <ColorField
              value={form.colorLight}
              defaultColor={DEFAULT_LIGHT}
              onChange={(v) => {
                setForm((f) => ({ ...f, colorLight: v }));
                if (err?.field === "colorLight") setErr(null);
              }}
            />
            <FieldError message={errFor("colorLight")} />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
