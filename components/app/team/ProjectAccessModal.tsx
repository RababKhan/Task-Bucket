"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";

type ProjectOption = { id: number; name: string };

// Manage which projects a member has access to. The API returns only the
// projects the acting user may grant/revoke (admin: all; manager: managed).
export default function ProjectAccessModal({
  uid,
  onClose,
  onSaved,
}: {
  uid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [grantable, setGrantable] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch(`/api/team/members/${uid}/project-access`)
      .then((r) => r.json())
      .then((d) => {
        setGrantable(d.grantable ?? []);
        setSelected(new Set<number>(d.current ?? []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [uid]);

  function toggle(id: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    // Only the grantable ids are sent; the API leaves admin-granted access
    // outside this set untouched.
    const ids = grantable.map((p) => p.id).filter((id) => selected.has(id));
    const res = await fetch(`/api/team/members/${uid}/project-access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_ids: ids }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not update project access.");
      return;
    }
    onSaved();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal cp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <h2>Manage project access</h2>
        </div>
        {loading ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : grantable.length === 0 ? (
          <p className="settings-card-sub">
            You don&apos;t manage any projects to grant access to.
          </p>
        ) : (
          <div className="invite-project-list">
            {grantable.map((p) => (
              <label key={p.id} className="invite-project-item">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        )}
        {error && <p className="invite-err">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={saving || loading}
          >
            {saving ? <Spinner /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
