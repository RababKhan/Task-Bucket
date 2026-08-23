"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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

// A small icon per module, shown before its section header in the matrix.
const ic = (paths: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {paths}
  </svg>
);
const MODULE_ICONS: Record<Module, ReactNode> = {
  dashboard: ic(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </>
  ),
  projects: ic(
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  tasks: ic(
    <>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  subtasks: ic(
    <>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  team_member: ic(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  settings: ic(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  roles: ic(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
};

type RoleCol = {
  id: number;
  key: string;
  name: string;
  is_system: number;
  active: number;
};

export default function RolesPage() {
  const perms = usePerms();

  const [roles, setRoles] = useState<RoleCol[]>([]);
  const [grants, setGrants] = useState<Record<number, Set<string>>>({});
  const [canManagePerms, setCanManagePerms] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [isFree, setIsFree] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // The matrix is always editable (no per-column edit toggle). `drafts` holds the
  // working state for every role, seeded from the saved `grants`; a column is
  // "dirty" when its draft diverges from what's saved.
  const [drafts, setDrafts] = useState<Record<number, Set<string>>>({});
  const [saving, setSaving] = useState(false);

  // Inline role-name editing (column headers).
  const [renamingRole, setRenamingRole] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameCancelRef = useRef(false);
  const [creating, setCreating] = useState(false);

  // Delete-role confirmation.
  const [deletingRole, setDeletingRole] = useState<RoleCol | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  // Per-column kebab (⋮) menu holding Rename / Delete. Positioned with `fixed`
  // so it escapes the horizontally-scrolling table's overflow clipping.
  const [menu, setMenu] = useState<{
    id: number;
    top: number;
    right: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const close = () => setMenu(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  function openMenu(e: React.MouseEvent, r: RoleCol) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu((cur) =>
      cur && cur.id === r.id
        ? null
        : {
            id: r.id,
            top: rect.bottom + 4,
            right: Math.max(8, window.innerWidth - rect.right),
          }
    );
  }

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
    // Seed drafts as an independent copy so edits don't mutate the saved state.
    const d: Record<number, Set<string>> = {};
    for (const [id, keys] of Object.entries(g)) d[Number(id)] = new Set(keys);
    setDrafts(d);
    setCanManagePerms(!!data.can_manage_permissions);
    setCanManageRoles(!!data.can_manage_roles);
    setIsFree(data.plan !== "pro");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function isAdminRole(r: RoleCol) {
    return r.is_system === 1 && r.key === "admin";
  }

  function startRename(r: RoleCol) {
    setErr(null);
    renameCancelRef.current = false;
    setRenamingRole(r.id);
    setRenameValue(r.name);
  }

  async function commitRename(r: RoleCol) {
    if (renamingRole !== r.id) return;
    const name = renameValue.trim();
    setRenamingRole(null);
    if (!name || name === r.name) return; // unchanged / empty → just close
    const res = await fetch(`/api/roles/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Could not rename role.");
      return;
    }
    setRoles((cur) => cur.map((x) => (x.id === r.id ? { ...x, name } : x)));
  }

  // Create a role instantly as a new column (default name "Employee", no
  // permissions), then drop it straight into inline-rename so it can be named.
  async function createRole() {
    if (creating) return;
    setCreating(true);
    setErr(null);
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Employee" }),
    });
    const data = await res.json().catch(() => ({}));
    setCreating(false);
    if (!res.ok) {
      setErr(data.error || "Could not create role.");
      return;
    }
    await load();
    if (data.id) {
      renameCancelRef.current = false;
      setRenamingRole(Number(data.id));
      setRenameValue("Employee");
    }
  }

  async function confirmDelete() {
    if (!deletingRole || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteErr(null);
    const res = await fetch(`/api/roles/${deletingRole.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    setDeleteBusy(false);
    if (!res.ok) {
      setDeleteErr(data.error || "Could not delete this role.");
      return;
    }
    setDeletingRole(null);
    await load();
  }

  function toggle(roleId: number, key: string) {
    setDrafts((cur) => {
      const next = new Set(cur[roleId] ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...cur, [roleId]: next };
    });
  }

  // Bulk set every permission of a module for a role (the per-module select-all).
  function setModulePerms(roleId: number, keys: string[], value: boolean) {
    setDrafts((cur) => {
      const next = new Set(cur[roleId] ?? []);
      for (const k of keys) {
        if (value) next.add(k);
        else next.delete(k);
      }
      return { ...cur, [roleId]: next };
    });
  }

  function discardAll() {
    const d: Record<number, Set<string>> = {};
    for (const [id, keys] of Object.entries(grants)) d[Number(id)] = new Set(keys);
    setDrafts(d);
    setErr(null);
  }

  async function saveAll() {
    if (saving || dirtyRoleIds.length === 0) return;
    setSaving(true);
    setErr(null);
    for (const id of dirtyRoleIds) {
      const res = await fetch(`/api/roles/${id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...(drafts[id] ?? [])] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErr(data.error || "Could not save permissions.");
        setSaving(false);
        return;
      }
    }
    // Commit the saved columns into `grants` so nothing shows as dirty anymore.
    setGrants((cur) => {
      const next = { ...cur };
      for (const id of dirtyRoleIds) next[id] = new Set(drafts[id] ?? []);
      return next;
    });
    setSaving(false);
  }

  if (perms.loaded && !perms.can("roles", "view")) {
    return (
      <AccessDenied message="Only Admin can manage roles and permissions." />
    );
  }

  // Whether a given role column's permissions may be edited (a Pro perk).
  const editableRole = (r: RoleCol) =>
    canManagePerms && !isAdminRole(r) && r.active === 1 && !isFree;

  // Whether a role's display name may be renamed inline (role management + Pro).
  const editableName = (r: RoleCol) =>
    canManageRoles && r.active === 1 && !isFree;

  // Only custom (non-system) roles can be deleted. System roles are locked.
  const deletableRole = (r: RoleCol) =>
    canManageRoles && r.is_system !== 1 && r.active === 1 && !isFree;

  // Cells reflect the draft; admin/inactive columns just mirror saved grants.
  const isChecked = (r: RoleCol, key: string) => !!drafts[r.id]?.has(key);

  const setsEqual = (a?: Set<string>, b?: Set<string>) => {
    const x = a ?? new Set<string>();
    const y = b ?? new Set<string>();
    if (x.size !== y.size) return false;
    for (const v of x) if (!y.has(v)) return false;
    return true;
  };
  const dirtyRoleIds = roles
    .filter((r) => editableRole(r) && !setsEqual(drafts[r.id], grants[r.id]))
    .map((r) => r.id);
  const hasChanges = dirtyRoleIds.length > 0;

  return (
    <div className="pv rpm-pv">
      <div className="pv-toolbar">
        <div className="rpm-toolbar-actions">
          {hasChanges && (
            <>
              <button
                type="button"
                className="pv-tool-btn pv-view"
                onClick={discardAll}
                disabled={saving}
              >
                Discard
              </button>
              <button
                type="button"
                className="pv-tool-btn pv-view pv-invite-btn"
                onClick={saveAll}
                disabled={saving}
              >
                {saving ? (
                  <Spinner />
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                    Save changes
                  </>
                )}
              </button>
            </>
          )}
          {canManageRoles &&
            (isFree ? (
              <span
                className="roles-create-lock"
                data-tip="Upgrade to Pro to create custom roles"
                data-tip-pos="left"
              >
                <button
                  type="button"
                  className="pv-tool-btn pv-view pv-invite-btn"
                  disabled
                  aria-disabled
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Create Role
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="pv-tool-btn pv-view pv-invite-btn"
                onClick={createRole}
                disabled={creating}
              >
                {creating ? (
                  <Spinner />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                )}
                Create Role
              </button>
            ))}
        </div>
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
                  const dirty = dirtyRoleIds.includes(r.id);
                  const showKebab =
                    renamingRole !== r.id &&
                    (editableName(r) || deletableRole(r));
                  // Built once and rendered on the right; a hidden mirror of the
                  // same width sits on the left so the name stays centered in the
                  // column (aligned with the checkboxes below).
                  const controls = (
                    <>
                      {dirty && (
                        <span className="rpm-dirty" data-tip="Unsaved changes" aria-label="Unsaved changes" />
                      )}
                      {isAdminRole(r) ? (
                        <span className="rpm-lock" data-tip="Admin always has full access" data-tip-pos="left">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        </span>
                      ) : isFree && canManagePerms && r.active === 1 ? (
                        <span
                          className="rpm-lock"
                          data-tip="Upgrade to Pro to edit permissions"
                          data-tip-pos="left"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="5" y="11" width="14" height="9" rx="2" />
                            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        </span>
                      ) : null}
                      {showKebab && (
                        <button
                          type="button"
                          className={`rpm-kebab${menu?.id === r.id ? " active" : ""}`}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => openMenu(e, r)}
                          aria-label={`${r.name} options`}
                          aria-haspopup="menu"
                          aria-expanded={menu?.id === r.id}
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="12" cy="5" r="1.7" />
                            <circle cx="12" cy="12" r="1.7" />
                            <circle cx="12" cy="19" r="1.7" />
                          </svg>
                        </button>
                      )}
                    </>
                  );
                  return (
                    <th key={r.id} className="rpm-col">
                      <div className="rpm-colhead">
                        {editableName(r) && renamingRole === r.id ? (
                          <input
                            className="rpm-rename-input"
                            value={renameValue}
                            autoFocus
                            maxLength={80}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.currentTarget.blur();
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                renameCancelRef.current = true;
                                e.currentTarget.blur();
                              }
                            }}
                            onBlur={() => {
                              if (renameCancelRef.current) {
                                renameCancelRef.current = false;
                                setRenamingRole(null);
                                return;
                              }
                              commitRename(r);
                            }}
                            aria-label={`Rename ${r.name}`}
                          />
                        ) : (
                          <>
                            <span className="rpm-colhead-side rpm-colhead-mirror" aria-hidden>
                              {controls}
                            </span>
                            <span className="rpm-rolename">{r.name}</span>
                            <span className="rpm-colhead-side">{controls}</span>
                          </>
                        )}
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
                  editableRole={editableRole}
                  onToggle={toggle}
                  onSetModule={setModulePerms}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Column kebab menu (Rename / Delete), fixed-positioned near its button */}
      {menu &&
        (() => {
          const r = roles.find((x) => x.id === menu.id);
          if (!r) return null;
          return (
            <div
              ref={menuRef}
              className="rpm-menu"
              role="menu"
              style={{ position: "fixed", top: menu.top, right: menu.right }}
            >
              {editableName(r) && (
                <button
                  type="button"
                  role="menuitem"
                  className="rpm-menu-item"
                  onClick={() => {
                    setMenu(null);
                    startRename(r);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Rename
                </button>
              )}
              {editableName(r) &&
                (deletableRole(r) ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="rpm-menu-item rpm-menu-danger"
                    onClick={() => {
                      setMenu(null);
                      setDeleteErr(null);
                      setDeletingRole(r);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    Delete
                  </button>
                ) : (
                  <span
                    className="rpm-menu-item rpm-menu-disabled"
                    role="menuitem"
                    aria-disabled
                    data-tip="Built-in roles can't be deleted"
                    data-tip-pos="bottom"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 6h18" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                    Delete
                  </span>
                ))}
            </div>
          );
        })()}

      {/* Delete-role confirmation (matches the delete-project confirm modal) */}
      {deletingRole && (
        <div
          className="overlay"
          onMouseDown={() => !deleteBusy && setDeletingRole(null)}
        >
          <div
            className="modal confirm-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="confirm-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </span>

            <h2>Delete Role</h2>
            <p className="confirm-text">
              Are you sure you want to delete{" "}
              <strong>{deletingRole.name}</strong>? This action cannot be undone.
              Anyone currently assigned this role will be moved to the default{" "}
              <strong>Member</strong> role.
            </p>
            {deleteErr && <p className="rpm-del-err">{deleteErr}</p>}

            <div className="confirm-actions">
              <button
                className="btn btn-primary confirm-keep"
                disabled={deleteBusy}
                onClick={() => setDeletingRole(null)}
              >
                No, Keep it
              </button>
              <button
                className="btn-outline confirm-del"
                onClick={confirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? <Spinner /> : "Yes, Delete it"}
              </button>
            </div>
          </div>
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
  editableRole,
  onToggle,
  onSetModule,
}: {
  module: Module;
  roles: RoleCol[];
  isChecked: (r: RoleCol, key: string) => boolean;
  editableRole: (r: RoleCol) => boolean;
  onToggle: (roleId: number, key: string) => void;
  onSetModule: (roleId: number, keys: string[], value: boolean) => void;
}) {
  const moduleKeys = VALID_ACTIONS[module].map((a) => permKey(module, a));
  return (
    <>
      <tr className="rpm-group">
        <td className="rpm-group-fn">
          <span className="rpm-group-label">
            <span className="rpm-group-ic">{MODULE_ICONS[module]}</span>
            {MODULE_LABELS[module]}
          </span>
        </td>
        {roles.map((r) => {
          if (!editableRole(r))
            return <td key={r.id} className="rpm-group-cell" />;
          const checkedCount = moduleKeys.filter((k) => isChecked(r, k)).length;
          const all = checkedCount === moduleKeys.length;
          const some = checkedCount > 0 && !all;
          return (
            <td key={r.id} className="rpm-group-cell">
              <label
                className="perm-checkbox"
                data-tip={all ? "Clear all" : "Select all"}
              >
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = some;
                  }}
                  onChange={() => onSetModule(r.id, moduleKeys, !all)}
                  aria-label={`${r.name}: all ${MODULE_LABELS[module]} permissions`}
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
      {VALID_ACTIONS[module].map((a) => {
        const key = permKey(module, a);
        return (
          <tr key={key} className="rpm-row">
            <td className="rpm-fn">{ACTION_LABELS[a]}</td>
            {roles.map((r) => {
              const disabled = !editableRole(r);
              return (
                <td key={r.id} className="rpm-cell">
                  <label className="perm-checkbox">
                    <input
                      type="checkbox"
                      checked={isChecked(r, key)}
                      disabled={disabled}
                      onChange={() => onToggle(r.id, key)}
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
