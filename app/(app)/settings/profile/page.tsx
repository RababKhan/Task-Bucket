"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Spinner from "@/components/Spinner";
import FieldError from "@/components/FieldError";
import SecurityCard from "@/components/app/settings/SecurityCard";
import { parsePhone, DEFAULT_DIAL_CODE } from "@/lib/countryCodes";
import CountryCodeSelect from "@/components/app/CountryCodeSelect";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Downscale + center-crop the chosen file to a small square avatar and return a
// data URL, so it stores compactly in the DB (no object storage needed).
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.onload = () => {
        const size = 240;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const user = session?.user;
  const name = user?.name || "";
  const email = user?.email || "";
  const ws = session?.workspace;
  const isAdmin = ws?.role === "admin";

  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Profile editing.
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    image: "",
    designation: "",
    phoneCode: DEFAULT_DIAL_CODE,
    phoneNumber: "",
  });
  // Designation + phone aren't on the session token — load them on demand.
  const [extra, setExtra] = useState({ designation: "", phone: "" });
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setExtra({ designation: d.designation || "", phone: d.phone || "" });
      })
      .catch(() => {});
  }, []);
  const [saving, setSaving] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ field: string; msg: string } | null>(
    null
  );
  const errFor = (f: string) =>
    fieldErr?.field === f ? fieldErr.msg : undefined;

  function startEdit() {
    const parsed = parsePhone(extra.phone);
    setForm({
      name,
      image: user?.image ?? "",
      designation: extra.designation,
      phoneCode: parsed.code,
      phoneNumber: parsed.number,
    });
    setFieldErr(null);
    setEditing(true);
  }
  // Clear a field's error as the user corrects it.
  function edit(field: keyof typeof form, key: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErr((e) => (e && e.field === key ? null : e));
  }

  async function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFieldErr({ field: "image", msg: "Please choose an image file." });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFieldErr({ field: "image", msg: "Image must be under 8 MB." });
      return;
    }
    try {
      const dataUrl = await resizeToDataUrl(file);
      setForm((f) => ({ ...f, image: dataUrl }));
      setFieldErr((er) => (er && er.field === "image" ? null : er));
    } catch {
      setFieldErr({ field: "image", msg: "Could not read that image." });
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setFieldErr(null);
    const combinedPhone = form.phoneNumber.trim()
      ? `${form.phoneCode} ${form.phoneNumber.trim()}`
      : "";
    const body: Record<string, string> = {
      name: form.name.trim(),
      designation: form.designation.trim(),
      phone: combinedPhone,
    };
    if (form.image !== (user?.image ?? "")) body.image = form.image;
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFieldErr({
        field: d.field || "name",
        msg: d.error || "Could not save changes.",
      });
      setSaving(false);
      return;
    }
    setExtra({ designation: form.designation.trim(), phone: combinedPhone });
    // Pass an argument so next-auth fires the jwt `trigger === "update"`
    // branch (a bare update() only refetches and won't re-read the DB).
    await update({}); // refresh the session (name + avatar)
    setSaving(false);
    setEditing(false);
  }

  async function deleteWorkspace() {
    if (!ws || confirmText.trim() !== ws.name || deleting) return;
    setDeleting(true);
    setError("");
    const res = await fetch("/api/workspace", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: confirmText.trim() }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not delete the workspace.");
      setDeleting(false);
      return;
    }
    // Workspace (and this session's backing data) is gone — sign out.
    signOut({ callbackUrl: "/login" });
  }

  // Has the user actually changed anything? The Update button only enables when
  // dirty; otherwise it's disabled with a tooltip explaining why.
  const origPhone = parsePhone(extra.phone);
  const dirty =
    form.name.trim() !== (name || "").trim() ||
    form.image !== (user?.image ?? "") ||
    form.designation.trim() !== extra.designation.trim() ||
    form.phoneCode !== origPhone.code ||
    form.phoneNumber.trim() !== origPhone.number;
  const updateTip = saving
    ? undefined
    : !form.name.trim()
      ? "Name is required"
      : !dirty
        ? "No changes to update"
        : undefined;

  // Session still resolving — show a loader rather than an empty account card.
  if (status === "loading") {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          {editing ? (
            <span className="profile-avatar-wrap" data-tip="Change photo">
              <label className="profile-avatar editable" aria-label="Change photo">
                {form.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.image} alt="" />
                ) : (
                  initials(name || email || "?")
                )}
                <span className="profile-avatar-cam" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </span>
                <input type="file" accept="image/*" onChange={pickImage} hidden />
              </label>
            </span>
          ) : (
            <span className="profile-avatar">
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" />
              ) : (
                initials(name || email || "?")
              )}
            </span>
          )}
          <div className="profile-headinfo">
            <div className="profile-name">
              {(editing ? form.name : name) || "Your account"}
            </div>
            <div className="profile-email">
              {(editing ? form.designation.trim() : extra.designation) || email}
            </div>
            {editing && <FieldError message={errFor("image")} />}
          </div>
          {!editing ? (
            <button className="btn btn-sm profile-edit-btn" onClick={startEdit}>
              Edit
            </button>
          ) : (
            <div className="profile-edit-actions">
              <button
                className="btn btn-sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <span className="profile-update-wrap" data-tip={updateTip}>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={save}
                  disabled={saving || !form.name.trim() || !dirty}
                >
                  {saving ? <Spinner /> : "Update"}
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="settings-grid">
          {editing ? (
            <>
              <div className="settings-field">
                <label>
                  Full Name<span className="req"> *</span>
                </label>
                <input
                  className={`cf-input${errFor("name") ? " invalid" : ""}`}
                  value={form.name}
                  onChange={(e) => edit("name", "name", e.target.value)}
                  placeholder="Your name"
                />
                <FieldError message={errFor("name")} />
              </div>
              <div className="settings-field">
                <label>Email Address</label>
                <div className="settings-value">{email || "—"}</div>
              </div>
              <div className="settings-field">
                <label>Designation</label>
                <input
                  className="cf-input"
                  value={form.designation}
                  onChange={(e) => edit("designation", "designation", e.target.value)}
                  placeholder="e.g. Product Manager"
                />
              </div>
              <div className="settings-field">
                <label>Phone number</label>
                <div className="phone-input">
                  <CountryCodeSelect
                    value={form.phoneCode}
                    onChange={(code) =>
                      setForm((f) => ({ ...f, phoneCode: code }))
                    }
                  />
                  <input
                    className="cf-input phone-number"
                    inputMode="numeric"
                    maxLength={15}
                    value={form.phoneNumber}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        phoneNumber: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    placeholder="1760533424"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Designation shows under the name in the header once set, so its
                  grid slot becomes the email; until then it prompts for one. */}
              {extra.designation ? (
                <div className="settings-field">
                  <label>Email Address</label>
                  <div className="settings-value">{email}</div>
                </div>
              ) : (
                <div className="settings-field">
                  <label>Designation</label>
                  <div className="settings-value settings-empty">
                    Add your designation in Edit
                  </div>
                </div>
              )}
              <div className="settings-field">
                <label>Phone number</label>
                {extra.phone ? (
                  <div className="settings-value">{extra.phone}</div>
                ) : (
                  <div className="settings-value settings-empty">
                    Add a phone number in Edit
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <SecurityCard />

      {isAdmin && ws && (
        <div className="settings-card settings-danger">
          <div className="settings-card-title">
            <svg className="settings-danger-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Danger zone
          </div>
          <p className="settings-card-sub">
            Permanently delete <strong>{ws.name}</strong> and everything in it
            such as projects, tasks, members, roles, and billing. This cannot be
            undone.
          </p>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setConfirmText("");
              setError("");
              setShowDelete(true);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Delete workspace
          </button>
        </div>
      )}

      {showDelete && ws && (
        <div
          className="overlay"
          onMouseDown={() => !deleting && setShowDelete(false)}
        >
          <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
            <span className="confirm-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </span>
            <h2>Delete workspace</h2>
            <p className="confirm-text">
              This permanently deletes <strong>{ws.name}</strong> and all its
              projects, tasks, members, and data. This action cannot be undone.
            </p>
            <p className="confirm-text">
              Type <strong>{ws.name}</strong> to confirm:
            </p>
            <input
              autoFocus
              className="cf-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={ws.name}
            />
            {error && <p className="invite-err">{error}</p>}
            <div className="confirm-actions">
              <button
                className="btn btn-primary confirm-keep"
                disabled={deleting}
                onClick={() => setShowDelete(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger btn-sm confirm-del"
                disabled={deleting || confirmText.trim() !== ws.name}
                onClick={deleteWorkspace}
              >
                {deleting ? (
                  <Spinner />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    Delete workspace
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
