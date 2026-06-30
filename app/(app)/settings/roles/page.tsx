"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import { usePerms } from "@/components/app/PermissionProvider";
import {
  MODULES,
  VALID_ACTIONS,
  MODULE_LABELS,
  ACTION_LABELS,
  permKey,
  type Module,
} from "@/lib/permissions";

type RoleCol = {
  id: number;
  key: string;
  name: string;
  is_system: number;
  active: number;
};

export default function RolesPage() {
  const router = useRouter();
  const perms = usePerms();

  const [roles, setRoles] = useState<RoleCol[]>([]);
  const [grants, setGrants] = useState<Record<number, Set<string>>>({});
  const [canManagePerms, setCanManagePerms] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Inline column editing: which role is being edited + a working draft set.
  const [editingRole, setEditingRole] = useState<number | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/roles/matrix");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRoles(data.roles ?? []);
    const g: Record<number, Set<string>> = {};
    for (const [id, keys] of Object.entries(data.grants ?? {})) {
      g[Number(id)] = new Set(keys as string[]);
    }
    setGrants(g);
    setCanManagePerms(!!data.can_manage_permissions);
    setCanManageRoles(!!data.can_manage_roles);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function isAdminRole(r: RoleCol) {
    return r.is_system === 1 && r.key === "admin";
  }

  function startEdit(r: RoleCol) {
    setErr(null);
    setEditingRole(r.id);
    setDraft(new Set(grants[r.id] ?? []));
  }

  function cancelEdit() {
    setEditingRole(null);
    setDraft(new Set());
  }

  function toggleDraft(key: string) {
    setDraft((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveEdit(roleId: number) {
    if (saving) return;
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/roles/${roleId}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: [...draft] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setErr(data.error || "Could not save permissions.");
      return;
    }
    setGrants((cur) => ({ ...cur, [roleId]: new Set(draft) }));
    setEditingRole(null);
    setDraft(new Set());
  }

  if (perms.loaded && !perms.can("roles", "view")) {
    return (
      <AccessDenied message="Only Admin can manage roles and permissions." />
    );
  }

  // Whether a given role column may be edited at all.
  const editableRole = (r: RoleCol) =>
    canManagePerms && !isAdminRole(r) && r.active === 1;

  // Is a cell checked for a role+permission (drafting overrides for the edited col).
  const isChecked = (r: RoleCol, key: string) =>
    editingRole === r.id ? draft.has(key) : !!grants[r.id]?.has(key);

  return (
    <div className="pv rpm-pv">
      <div className="pv-toolbar">
        <span className="pv-toolbar-hint">
          Each row is a permission; tick the roles that should have it. Use the
          pencil to edit a role&apos;s column, then Save.
        </span>
        {canManageRoles && (
          <button
            type="button"
            className="pv-tool-btn pv-view pv-invite-btn"
            onClick={() => router.push("/settings/roles/new")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create role
          </button>
        )}
      </div>

      {err && <p className="invite-err">{err}</p>}

      {loading ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : (
        <div className="rpm-wrap">
          <table className="rpm-table">
            <thead>
              <tr>
                <th className="rpm-corner">Functionality</th>
                {roles.map((r) => {
                  const editing = editingRole === r.id;
                  return (
                    <th key={r.id} className="rpm-col">
                      <div className="rpm-colhead">
                        <button
                          type="button"
                          className="rpm-rolename"
                          onClick={() => router.push(`/settings/roles/${r.id}`)}
                          title="Open role details"
                        >
                          {r.name}
                        </button>
                        {editing ? (
                          <span className="rpm-editbtns">
                            <button
                              type="button"
                              className="rpm-iconbtn rpm-save"
                              onClick={() => saveEdit(r.id)}
                              disabled={saving}
                              aria-label="Save"
                              title="Save"
                            >
                              {saving ? (
                                <Spinner />
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M5 12l4 4 10-10" />
                                </svg>
                              )}
                            </button>
                            <button
                              type="button"
                              className="rpm-iconbtn rpm-cancel"
                              onClick={cancelEdit}
                              disabled={saving}
                              aria-label="Cancel"
                              title="Cancel"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M18 6 6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ) : editableRole(r) ? (
                          <button
                            type="button"
                            className="rpm-iconbtn rpm-edit"
                            onClick={() => startEdit(r)}
                            disabled={editingRole !== null}
                            aria-label={`Edit ${r.name} permissions`}
                            title="Edit permissions"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                        ) : isAdminRole(r) ? (
                          <span className="rpm-lock" title="Admin always has full access" aria-hidden>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="5" y="11" width="14" height="9" rx="2" />
                              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                            </svg>
                          </span>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m: Module) => (
                <RoleModuleRows
                  key={m}
                  module={m}
                  roles={roles}
                  isChecked={isChecked}
                  editingRole={editingRole}
                  isAdminRole={isAdminRole}
                  onToggle={toggleDraft}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Renders a module group header + one row per valid action in that module.
function RoleModuleRows({
  module,
  roles,
  isChecked,
  editingRole,
  isAdminRole,
  onToggle,
}: {
  module: Module;
  roles: RoleCol[];
  isChecked: (r: RoleCol, key: string) => boolean;
  editingRole: number | null;
  isAdminRole: (r: RoleCol) => boolean;
  onToggle: (key: string) => void;
}) {
  return (
    <>
      <tr className="rpm-group">
        <td colSpan={roles.length + 1}>{MODULE_LABELS[module]}</td>
      </tr>
      {VALID_ACTIONS[module].map((a) => {
        const key = permKey(module, a);
        return (
          <tr key={key} className="rpm-row">
            <td className="rpm-fn">{ACTION_LABELS[a]}</td>
            {roles.map((r) => {
              const editingThis = editingRole === r.id;
              const locked = isAdminRole(r);
              const disabled = locked || !editingThis;
              return (
                <td key={r.id} className="rpm-cell">
                  <label className="perm-checkbox">
                    <input
                      type="checkbox"
                      checked={isChecked(r, key)}
                      disabled={disabled}
                      onChange={() => onToggle(key)}
                      aria-label={`${r.name}: ${MODULE_LABELS[module]} — ${ACTION_LABELS[a]}`}
                    />
                    <span className="perm-checkbox-box" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5L20 6" />
                      </svg>
                    </span>
                  </label>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
