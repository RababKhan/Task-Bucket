"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";

type RoleOption = { key: string; name: string };

// Change a member's role. Roles list is fetched from /api/team/members (active
// roles, system + custom). Surfaces server guard errors (last admin, etc.).
export default function EditRoleModal({
  uid,
  currentRole,
  onClose,
  onSaved,
}: {
  uid: string;
  currentRole: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [role, setRole] = useState(currentRole);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/team/members?pageSize=1")
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []))
      .catch(() => {});
  }, []);

  async function save() {
    if (saving || role === currentRole) {
      if (role === currentRole) onClose();
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not update the role.");
      return;
    }
    onSaved();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal confirm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="confirm-title">Update role</h2>
        <div className="field">
          <label>Role</label>
          <select
            className="cf-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="invite-err">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? <Spinner /> : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
