"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import PermissionMatrix from "@/components/app/PermissionMatrix";
import { usePerms } from "@/components/app/PermissionProvider";

export default function NewRolePage() {
  const router = useRouter();
  const perms = usePerms();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (perms.loaded && !perms.can("roles", "manage_roles")) {
    return (
      <AccessDenied message="Only Admin can manage roles and permissions." />
    );
  }

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setErr(null);
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        permissions: [...selected],
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(data.error || "Could not create the role.");
      return;
    }
    router.push("/settings/roles");
  }

  return (
    <div className="roles-page">
      <div className="roles-head">
        <div>
          <h1 className="roles-title">Create role</h1>
          <p className="roles-sub">
            Name the role and choose what it can access.
          </p>
        </div>
        <Link href="/settings/roles" className="btn btn-sm">
          Cancel
        </Link>
      </div>

      {err && <p className="invite-err">{err}</p>}

      <div className="settings-card">
        <div className="role-form-grid">
          <label className="cf-label">
            Role name
            <input
              className="cf-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. QA Reviewer"
              maxLength={80}
            />
          </label>
          <label className="cf-label">
            Description
            <input
              className="cf-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this role for?"
              maxLength={200}
            />
          </label>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Permissions</div>
        <PermissionMatrix value={selected} onChange={setSelected} />
      </div>

      <div className="roles-foot">
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={save}
          disabled={saving || !name.trim()}
        >
          {saving ? <Spinner /> : "Create role"}
        </button>
      </div>
    </div>
  );
}
