"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Spinner from "@/components/Spinner";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfilePage() {
  const { data: session, update } = useSession();
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
  const [form, setForm] = useState({ name: "", workspaceName: "", subdomain: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  function startEdit() {
    setForm({
      name,
      workspaceName: ws?.name ?? "",
      subdomain: ws?.subdomain ?? "",
    });
    setSaveErr("");
    setEditing(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveErr("");
    const body: Record<string, string> = { name: form.name.trim() };
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
      setSaveErr(d.error || "Could not save changes.");
      setSaving(false);
      return;
    }
    await update(); // refresh the session (name + workspace)
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

  return (
    <>
      <div className="settings-card">
        <div className="settings-card-head">
          <span className="profile-avatar">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" />
            ) : (
              initials(name || email || "?")
            )}
          </span>
          <div>
            <div className="profile-name">{name || "Your account"}</div>
            <div className="profile-email">{email}</div>
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
          <div className="settings-field">
            <label>Full Name</label>
            {editing ? (
              <input
                className="cf-input"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Your name"
              />
            ) : (
              <div className="settings-value">{name || "—"}</div>
            )}
          </div>
          <div className="settings-field">
            <label>Email Address</label>
            <div className="settings-value">{email || "—"}</div>
          </div>
          {ws && (
            <>
              <div className="settings-field">
                <label>Workspace</label>
                {editing && isAdmin ? (
                  <input
                    className="cf-input"
                    value={form.workspaceName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, workspaceName: e.target.value }))
                    }
                    placeholder="Workspace name"
                  />
                ) : (
                  <div className="settings-value">{ws.name}</div>
                )}
              </div>
              <div className="settings-field">
                <label>Subdomain</label>
                {editing && isAdmin ? (
                  <input
                    className="cf-input"
                    value={form.subdomain}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, subdomain: e.target.value }))
                    }
                    placeholder="your-workspace"
                  />
                ) : (
                  <div className="settings-value">{ws.subdomain}</div>
                )}
              </div>
            </>
          )}
        </div>
        {saveErr && <p className="invite-err profile-save-err">{saveErr}</p>}
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
