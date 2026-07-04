"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Spinner from "@/components/Spinner";
import FieldError from "@/components/FieldError";

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
    workspaceName: "",
    subdomain: "",
    image: "",
  });
  const [saving, setSaving] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ field: string; msg: string } | null>(
    null
  );
  const errFor = (f: string) =>
    fieldErr?.field === f ? fieldErr.msg : undefined;

  function startEdit() {
    setForm({
      name,
      workspaceName: ws?.name ?? "",
      subdomain: ws?.subdomain ?? "",
      image: user?.image ?? "",
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
    const body: Record<string, string> = { name: form.name.trim() };
    if (form.image !== (user?.image ?? "")) body.image = form.image;
    if (isAdmin && ws) {
      body.workspace_name = form.workspaceName.trim();
      body.subdomain = form.subdomain.trim().toLowerCase();
    }
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
    // Pass an argument so next-auth fires the jwt `trigger === "update"`
    // branch (a bare update() only refetches and won't re-read the DB).
    await update({}); // refresh the session (name + workspace + avatar)
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

  // Session still resolving — show a loader rather than an empty account card.
  if (status === "loading") {
    return (
      <div className="settings-loading">
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
            <div className="profile-name">{name || "Your account"}</div>
            <div className="profile-email">{email}</div>
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
              <button
                className="btn btn-sm btn-primary"
                onClick={save}
                disabled={saving || !form.name.trim()}
              >
                {saving ? <Spinner /> : "Save"}
              </button>
            </div>
          )}
        </div>

        <div className="settings-grid">
          {editing && (
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
            </>
          )}
          {ws && (
            <>
              <div className="settings-field">
                <label>
                  Workspace
                  {editing && isAdmin && <span className="req"> *</span>}
                </label>
                {editing && isAdmin ? (
                  <>
                    <input
                      className={`cf-input${errFor("workspace_name") ? " invalid" : ""}`}
                      value={form.workspaceName}
                      onChange={(e) =>
                        edit("workspaceName", "workspace_name", e.target.value)
                      }
                      placeholder="Workspace name"
                    />
                    <FieldError message={errFor("workspace_name")} />
                  </>
                ) : (
                  <div className="settings-value">{ws.name}</div>
                )}
              </div>
              <div className="settings-field">
                <label>
                  Subdomain
                  {editing && isAdmin && <span className="req"> *</span>}
                </label>
                {editing && isAdmin ? (
                  <>
                    <input
                      className={`cf-input${errFor("subdomain") ? " invalid" : ""}`}
                      value={form.subdomain}
                      onChange={(e) =>
                        edit("subdomain", "subdomain", e.target.value)
                      }
                      placeholder="your-workspace"
                    />
                    <FieldError message={errFor("subdomain")} />
                  </>
                ) : (
                  <div className="settings-value">{ws.subdomain}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isAdmin && ws && (
        <div className="settings-card settings-danger">
          <div className="settings-card-title">Danger zone</div>
          <p className="settings-card-sub">
            Permanently delete <strong>{ws.name}</strong> and everything in it —
            projects, tasks, members, roles, and billing. This cannot be undone.
          </p>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setConfirmText("");
              setError("");
              setShowDelete(true);
            }}
          >
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
                className="btn-outline confirm-del"
                disabled={deleting || confirmText.trim() !== ws.name}
                onClick={deleteWorkspace}
              >
                {deleting ? <Spinner /> : "Delete workspace"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
