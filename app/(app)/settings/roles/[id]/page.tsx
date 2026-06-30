"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import PermissionMatrix from "@/components/app/PermissionMatrix";
import { usePerms } from "@/components/app/PermissionProvider";
import type { RoleRow } from "@/lib/types";

export default function EditRolePage() {
  const params = useParams();
  const roleId = Number(params.id);
  const router = useRouter();
  const perms = usePerms();

  const [role, setRole] = useState<RoleRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const canManageRoles = perms.can("roles", "manage_roles");
  const canManagePerms = perms.can("roles", "manage_permissions");

  const load = useCallback(async () => {
    // Role metadata comes from the list; grants from the permissions endpoint.
    const [listRes, permRes] = await Promise.all([
      fetch("/api/roles"),
      fetch(`/api/roles/${roleId}/permissions`),
    ]);
    if (listRes.ok) {
      const data = await listRes.json();
      const found = (data.roles ?? []).find(
        (r: RoleRow) => r.id === roleId
      ) as RoleRow | undefined;
      if (found) {
        setRole(found);
        setName(found.name);
        setDescription(found.description);
      }
    }
    if (permRes.ok) {
      const data = await permRes.json();
      setSelected(new Set<string>(data.permissions ?? []));
      setLocked(!!data.locked);
    }
    setLoading(false);
  }, [roleId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMsg(null);

    // Persist name/description (if the user can manage roles and they changed).
    if (canManageRoles && role) {
      if (name.trim() !== role.name || description.trim() !== role.description) {
        const res = await fetch(`/api/roles/${roleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaving(false);
          setMsg({ kind: "err", text: data.error || "Could not save." });
          return;
        }
      }
    }

    // Persist the permission matrix (if the user can manage permissions).
    if (canManagePerms && !locked) {
      const res = await fetch(`/api/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...selected] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaving(false);
        setMsg({ kind: "err", text: data.error || "Could not save." });
        return;
      }
    }

    setSaving(false);
    setMsg({ kind: "ok", text: "Saved." });
    await load();
  }

  async function toggleActive() {
    if (!role) return;
    setMsg(null);
    const res = await fetch(`/api/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: role.active ? 0 : 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ kind: "err", text: data.error || "Could not update the role." });
      return;
    }
    await load();
  }

  async function removeRole() {
    if (!role) return;
    if (!window.confirm(`Delete the "${role.name}" role?`)) return;
    const res = await fetch(`/api/roles/${roleId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg({ kind: "err", text: data.error || "Could not delete the role." });
      return;
    }
    router.push("/settings/roles");
  }

  if (perms.loaded && !perms.can("roles", "view")) {
    return (
      <AccessDenied message="Only Admin can manage roles and permissions." />
    );
  }
  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }
  if (!role) {
    return <AccessDenied message="That role no longer exists." />;
  }

  const readOnlyMatrix = locked || !canManagePerms;
  const readOnlyMeta = !!role.is_system || !canManageRoles;

  return (
    <div className="roles-page">
      <div className="roles-head">
        <div>
          <h1 className="roles-title">
            {role.name}
            <span
              className={`role-badge ${
                role.is_system ? "role-badge-system" : "role-badge-custom"
              }`}
            >
              {role.is_system ? "Built-in" : "Custom"}
            </span>
          </h1>
          <p className="roles-sub">
            {locked
              ? "The Admin role always has full access and can't be changed."
              : "Edit this role's details and permissions. Changes apply to everyone with the role."}
          </p>
        </div>
        <div className="roles-head-actions">
          {canManageRoles && !role.is_system && (
            <>
              <button type="button" className="btn btn-sm" onClick={toggleActive}>
                {role.active ? "Deactivate" : "Activate"}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={removeRole}
              >
                Delete
              </button>
            </>
          )}
          <Link href="/settings/roles" className="btn btn-sm">
            Back
          </Link>
        </div>
      </div>

      {msg && (
        <p className={msg.kind === "ok" ? "invite-ok" : "invite-err"}>
          {msg.text}
        </p>
      )}

      <div className="settings-card">
        <div className="role-form-grid">
          <label className="cf-label">
            Role name
            <input
              className="cf-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnlyMeta}
              maxLength={80}
            />
          </label>
          <label className="cf-label">
            Description
            <input
              className="cf-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnlyMeta}
              maxLength={200}
            />
          </label>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Permissions</div>
        <PermissionMatrix
          value={selected}
          onChange={setSelected}
          readOnly={readOnlyMatrix}
        />
      </div>

      {!(readOnlyMatrix && readOnlyMeta) && (
        <div className="roles-foot">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? <Spinner /> : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
