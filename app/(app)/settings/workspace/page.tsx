"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Spinner from "@/components/Spinner";
import FieldError from "@/components/FieldError";

export default function WorkspaceSettingsPage() {
  const { data: session, status, update } = useSession();
  const ws = session?.workspace;
  const isAdmin = ws?.role === "admin";

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ workspaceName: "", subdomain: "" });
  const [saving, setSaving] = useState(false);
  const [fieldErr, setFieldErr] = useState<{ field: string; msg: string } | null>(
    null
  );
  const errFor = (f: string) =>
    fieldErr?.field === f ? fieldErr.msg : undefined;

  function startEdit() {
    setForm({
      workspaceName: ws?.name ?? "",
      subdomain: ws?.subdomain ?? "",
    });
    setFieldErr(null);
    setEditing(true);
  }
  function edit(field: keyof typeof form, key: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErr((e) => (e && e.field === key ? null : e));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setFieldErr(null);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_name: form.workspaceName.trim(),
        subdomain: form.subdomain.trim().toLowerCase(),
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFieldErr({
        field: d.field || "workspace_name",
        msg: d.error || "Could not save changes.",
      });
      setSaving(false);
      return;
    }
    await update({}); // refresh the cached workspace on the session
    setSaving(false);
    setEditing(false);
  }

  const dirty =
    form.workspaceName.trim() !== (ws?.name ?? "") ||
    form.subdomain.trim().toLowerCase() !== (ws?.subdomain ?? "");
  const updateTip = saving
    ? undefined
    : !form.workspaceName.trim()
      ? "Workspace name is required"
      : !form.subdomain.trim()
        ? "Subdomain is required"
        : !dirty
          ? "No changes to update"
          : undefined;

  if (status === "loading") {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }
  if (!ws) return null;

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <div className="profile-headinfo">
          <div className="settings-card-title">Workspace</div>
          <div className="security-desc">
            Your workspace name and the subdomain teammates use to reach it.
          </div>
        </div>
        {!editing ? (
          isAdmin && (
            <button className="btn btn-sm profile-edit-btn" onClick={startEdit}>
              Edit
            </button>
          )
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
                disabled={
                  saving ||
                  !form.workspaceName.trim() ||
                  !form.subdomain.trim() ||
                  !dirty
                }
              >
                {saving ? <Spinner /> : "Update"}
              </button>
            </span>
          </div>
        )}
      </div>

      <div className="settings-grid">
        <div className="settings-field">
          <label>
            Workspace
            {editing && <span className="req"> *</span>}
          </label>
          {editing ? (
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
            {editing && <span className="req"> *</span>}
          </label>
          {editing ? (
            <>
              <input
                className={`cf-input${errFor("subdomain") ? " invalid" : ""}`}
                value={form.subdomain}
                onChange={(e) => edit("subdomain", "subdomain", e.target.value)}
                placeholder="your-workspace"
              />
              <FieldError message={errFor("subdomain")} />
            </>
          ) : (
            <div className="settings-value">{ws.subdomain}</div>
          )}
        </div>
      </div>
    </div>
  );
}
