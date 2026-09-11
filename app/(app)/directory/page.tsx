"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import { usePerms } from "@/components/app/PermissionProvider";
import InviteMemberModal from "@/components/app/team/InviteMemberModal";
import SelectField from "@/components/app/SelectField";
import ConfirmModal from "@/components/app/team/ConfirmModal";
import Toast, { type ToastState } from "@/components/app/Toast";
import PendingInvites from "@/components/app/team/PendingInvites";
import { type TeamMember } from "@/lib/types";

type RoleOption = { key: string; name: string };

// Column layout for the grid table (mirrors the Projects view's pv-table).
const GRID = "20px 1.4fr 1.5fr 1fr";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const PAGE_SIZE = 20;

// Sorting matches the Projects and Tasks modules. Role orders by seniority
// (Owner, Admin, Manager, Assignee, then custom roles), not alphabetically.
type SortKey = "role";
const SORT_FIELDS: { key: SortKey; label: string }[] = [
  { key: "role", label: "Role" },
];
const SORT_PREF_KEY = "tb-directory-sort";

export default function DirectoryPage() {
  const perms = usePerms();
  const router = useRouter();
  const { data: session } = useSession();
  const myId = session?.user?.id;

  const [page, setPage] = useState(1);

  // Filters
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<Set<string>>(new Set());
  const [pendingRoles, setPendingRoles] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterApplying, setFilterApplying] = useState(false);

  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_PREF_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as { sortBy?: SortKey; sortDir?: string };
      if (v.sortBy && SORT_FIELDS.some((f) => f.key === v.sortBy)) {
        setSortBy(v.sortBy);
      }
      if (v.sortDir === "asc" || v.sortDir === "desc") setSortDir(v.sortDir);
    } catch {
      // A malformed preference is not worth failing the page over.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_PREF_KEY, JSON.stringify({ sortBy, sortDir }));
    } catch {
      // Private browsing and the like — sorting works, it just won't stick.
    }
  }, [sortBy, sortDir]);

  function applySort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  function clearSort() {
    setSortBy(null);
    setSortOpen(false);
  }

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDelete, setBulkDelete] = useState(false);
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [invitesKey, setInvitesKey] = useState(0);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 whenever a filter or the sort changes — page 3 of the old
  // order means nothing in the new one.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, roleFilter, sortBy, sortDir]);

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (roleFilter.size) params.set("role", [...roleFilter].join(","));
    if (sortBy) {
      params.set("sort", sortBy);
      params.set("dir", sortDir);
    }
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [debouncedQ, roleFilter, page, sortBy, sortDir]);

  // One cache entry per filter/page combination; keepPreviousData holds the old
  // rows visible while the next page/filter loads (no spinner flash).
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["team-members", qs],
    queryFn: () =>
      apiGet<{
        members?: TeamMember[];
        roles?: RoleOption[];
        total?: number;
        can_invite?: boolean;
        can_update_role?: boolean;
        can_remove?: boolean;
        can_resend?: boolean;
        can_cancel?: boolean;
      }>(`/api/team/members?${qs}`),
    placeholderData: keepPreviousData,
  });
  const load = refetch;
  const members = data?.members ?? [];
  const roles = data?.roles ?? [];
  const total = data?.total ?? 0;
  const canInvite = !!data?.can_invite;
  const canUpdateRole = !!data?.can_update_role;
  const canRemove = !!data?.can_remove;
  const canResend = !!data?.can_resend;
  const canCancel = !!data?.can_cancel;
  const loading = isLoading;

  async function updateRole(m: TeamMember, role: string) {
    if (role === m.role || savingUid) return;
    setSavingUid(m.user_id);
    setToast(null);
    const res = await fetch(`/api/members/${m.user_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    setSavingUid(null);
    if (!res.ok) {
      setToast({ message: data.error || "Could not update the role.", variant: "error" });
      return;
    }
    const label = roles.find((r) => r.key === role)?.name ?? role;
    setToast({
      message: `${m.name || m.email} is now ${label}.`,
      variant: "success",
    });
    load();
  }

  // Empty string = removable. Mirrors the guards in /api/members/[uid].
  function removeBlockReason(m: TeamMember) {
    if (m.role === "owner") return "The workspace Owner can't be removed.";
    if (m.user_id === myId) return "You can't remove yourself.";
    return "";
  }

  // The Owner is bound to the workspace creator, so their role is fixed.
  const roleLocked = (m: TeamMember) => m.role === "owner";

  function openFilter() {
    setPendingRoles(new Set(roleFilter));
    setFilterOpen(true);
  }

  function togglePendingRole(key: string) {
    setPendingRoles((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // "Clear all" resets the sort as well as the filters, matching the Projects
  // module — it is the one control that puts the table back to its default.
  function clearFilter() {
    setRoleFilter(new Set());
    setPendingRoles(new Set());
    setFilterOpen(false);
    setSortBy(null);
    setSortOpen(false);
  }

  function applyFilter() {
    if (filterApplying) return;
    setFilterApplying(true);
    window.setTimeout(() => {
      setRoleFilter(new Set(pendingRoles));
      setFilterApplying(false);
      setFilterOpen(false);
    }, 150);
  }

  function toggleSelect(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  async function bulkRemove() {
    setToast(null);
    const count = selected.size;
    const failures: string[] = [];
    for (const uid of selected) {
      const res = await fetch(`/api/members/${uid}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        failures.push(d.error || "Could not remove a member.");
      }
    }
    setBulkDelete(false);
    setSelected(new Set());
    setToast(
      failures.length
        ? { message: failures[0], variant: "error" }
        : {
            message: `${count} member${count === 1 ? "" : "s"} removed from the workspace.`,
            variant: "success",
          }
    );
    load();
  }

  async function removeMember(m: TeamMember) {
    setToast(null);
    const res = await fetch(`/api/members/${m.user_id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setRemoving(null);
    if (!res.ok) {
      setToast({ message: data.error || "Could not remove the member.", variant: "error" });
      return;
    }
    setToast({
      message: `${m.name || m.email} was removed from the workspace.`,
      variant: "success",
    });
    load();
  }

  if (perms.loaded && !perms.can("team_member", "view")) {
    return (
      <AccessDenied message="You do not have permission to view team members." />
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!q || roleFilter.size > 0;

  return (
    <div className="pv dir-pv">
      {/* Toolbar — same skin as the Projects view */}
      <div className="pv-toolbar">
        <div className="pv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
          />
          {q && (
            <button
              type="button"
              className="pv-search-clear"
              onClick={() => setQ("")}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="pv-sort">
          <button
            className={`pv-tool-btn${roleFilter.size ? " active" : ""}`}
            type="button"
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M7 12h10M11 18h2" />
            </svg>
            Filter
            {roleFilter.size > 0 && (
              <span className="pv-sort-tag">{roleFilter.size}</span>
            )}
          </button>
          {filterOpen && (
            <>
              <div className="pv-menu-backdrop" onClick={() => setFilterOpen(false)} />
              <div className="pv-filter-pop">
                <div className="pv-filter-list">
                  {roles.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`pv-filter-opt${pendingRoles.has(r.key) ? " sel" : ""}`}
                      onClick={() => togglePendingRole(r.key)}
                    >
                      <span>{r.name}</span>
                      {pendingRoles.has(r.key) && (
                        <svg className="pv-filter-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12l4 4 10-10" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="pv-filter-apply"
                  onClick={applyFilter}
                  disabled={filterApplying}
                >
                  {filterApplying ? (
                    <>
                      Applying
                      <Spinner />
                    </>
                  ) : (
                    "Apply Filter"
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="pv-sort">
          <button
            className={`pv-tool-btn${sortBy ? " active" : ""}`}
            type="button"
            onClick={() => setSortOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {sortBy ? (
                sortDir === "asc" ? (
                  <path d="M4 6h10M4 12h7M4 18h4M18 19V5M18 5l-3 3M18 5l3 3" />
                ) : (
                  <path d="M4 6h10M4 12h7M4 18h4M18 5v14M18 19l-3-3M18 19l3-3" />
                )
              ) : (
                <path d="M3 7h12M3 12h8M3 17h4M17 5v14M17 19l3-3M17 19l-3-3" />
              )}
            </svg>
            Sort
            {sortBy && (
              <span className="pv-sort-tag">
                {SORT_FIELDS.find((f) => f.key === sortBy)?.label}
              </span>
            )}
          </button>
          {sortOpen && (
            <>
              <div
                className="pv-menu-backdrop"
                onClick={() => setSortOpen(false)}
              />
              <div className="pv-sort-menu">
                {SORT_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    className={`pv-sort-item${sortBy === f.key ? " active" : ""}`}
                    onClick={() => applySort(f.key)}
                  >
                    {f.label}
                    {sortBy === f.key && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        {sortDir === "asc" ? (
                          <path d="m6 15 6-6 6 6" />
                        ) : (
                          <path d="m6 9 6 6 6-6" />
                        )}
                      </svg>
                    )}
                  </button>
                ))}
                {sortBy && (
                  <button className="pv-sort-clear" onClick={clearSort}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M15 9l-6 6M9 9l6 6" />
                    </svg>
                    Clear sort
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {(roleFilter.size > 0 || sortBy) && (
          <button className="pv-tool-btn pv-clear-all" type="button" onClick={clearFilter}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            Clear all
          </button>
        )}

        <div className="pv-toolbar-right">
          {perms.can("roles", "view") && (
            <button
              type="button"
              className="pv-tool-btn"
              onClick={() => router.push("/settings/roles")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2a3 3 0 0 0-3 3v1H7a2 2 0 0 0-2 2v3a3 3 0 0 0 0 6v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a3 3 0 0 0 0-6V8a2 2 0 0 0-2-2h-2V5a3 3 0 0 0-3-3Z" />
                <path d="m9.5 13 1.5 1.5 3-3" />
              </svg>
              Roles &amp; Permissions
            </button>
          )}
          {canInvite && (
            <button
              type="button"
              className="pv-tool-btn pv-invite-btn"
              onClick={() => setShowInvite(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
              Invite member
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : members.length === 0 ? (
        <div className="pv-empty-search">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="27" cy="27" r="18" />
            <path d="M40 40l15 15" />
            <circle cx="21" cy="24" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="33" cy="24" r="1.4" fill="currentColor" stroke="none" />
            <path d="M22 34c2.5-3 7.5-3 10 0" />
          </svg>
          <p>
            {hasFilters
              ? "No members match your filters."
              : "No team members yet."}
          </p>
        </div>
      ) : (
        <div className="pv-table">
          {selected.size > 0 && (
            <div className="pv-selbar">
              <span className="pv-selcount">{selected.size}</span>
              <button
                className="pv-selact danger"
                onClick={() => setBulkDelete(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
                Delete
              </button>
            </div>
          )}

          <div className="pv-head" style={{ gridTemplateColumns: GRID }}>
            <span className="pv-ctrl" aria-hidden />
            <span>Member Name</span>
            <span>Email</span>
            <span>Role</span>
          </div>

          {members.map((m) => (
            <div
              key={m.user_id}
              className={`pv-row${selected.has(m.user_id) ? " selected" : ""}`}
              style={{ gridTemplateColumns: GRID }}
            >
              <span
                className="pv-ctrl"
                data-tip={removeBlockReason(m) || undefined}
                data-tip-pos="right"
              >
                {canRemove && (
                  <input
                    type="checkbox"
                    className="pv-check"
                    checked={selected.has(m.user_id)}
                    disabled={!!removeBlockReason(m)}
                    onChange={() => toggleSelect(m.user_id)}
                    aria-label={`Select ${m.name || m.email}`}
                  />
                )}
              </span>
              <span
                className="pv-cell pv-title-cell"
                onClick={() => router.push(`/directory/${m.user_id}`)}
              >
                <span className="pv-avatar">
                  {m.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.image} alt="" />
                  ) : (
                    initials(m.name || m.email || "?")
                  )}
                </span>
                <span className="pv-title">{m.name || m.email}</span>
              </span>
              <span className="pv-cell dir-email">{m.email}</span>
              <span className="pv-cell dir-role-cell">
                {canUpdateRole && m.user_id !== myId && !roleLocked(m) ? (
                  <SelectField
                    inline
                    chevron
                    value={m.role}
                    options={roles.map((r) => ({ value: r.key, label: r.name }))}
                    onChange={(v) => updateRole(m, v)}
                  />
                ) : (
                  <span className="dir-role">{m.role_name}</span>
                )}
                {canRemove && (
                  <button
                    type="button"
                    className={`pv-kebab${menuUid === m.user_id ? " open" : ""}`}
                    aria-label="Member actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuUid(menuUid === m.user_id ? null : m.user_id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="5" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="12" cy="19" r="1.8" />
                    </svg>
                  </button>
                )}
                {menuUid === m.user_id && (
                  <>
                    <div
                      className="pv-menu-backdrop"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuUid(null);
                      }}
                    />
                    <div className="pv-menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="pv-menu-item danger"
                        disabled={!!removeBlockReason(m)}
                        data-tip={removeBlockReason(m) || undefined}
                        data-tip-pos="left"
                        onClick={() => {
                          if (removeBlockReason(m)) return;
                          setMenuUid(null);
                          setRemoving(m);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </span>
            </div>
          ))}

          <PendingInvites
            canResend={canResend}
            canCancel={canCancel}
            refreshKey={invitesKey}
            grid={GRID}
          />
        </div>
      )}

      {totalPages > 1 && (
        <div className="dir-pagination">
          <button
            type="button"
            className="pv-tool-btn"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="dir-page-info">
            Page {page} of {totalPages} · {total} member{total === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="pv-tool-btn"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {removing && (
        <ConfirmModal
          title="Remove Member"
          body={
            <>
              Are you sure you want to remove{" "}
              <strong>{removing.name || removing.email}</strong> from this
              workspace? This action cannot be undone. They&apos;ll lose access
              immediately.
            </>
          }
          confirmLabel="Yes, Remove it"
          onClose={() => setRemoving(null)}
          onConfirm={() => removeMember(removing)}
        />
      )}

      {bulkDelete && (
        <ConfirmModal
          title={selected.size > 1 ? "Remove Members" : "Remove Member"}
          body={
            <>
              Are you sure you want to remove{" "}
              <strong>
                {selected.size} member{selected.size === 1 ? "" : "s"}
              </strong>{" "}
              from this workspace? This action cannot be undone. They&apos;ll
              lose access immediately.
            </>
          }
          confirmLabel="Yes, Remove them"
          onClose={() => setBulkDelete(false)}
          onConfirm={bulkRemove}
        />
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />

      {showInvite && (
        <InviteMemberModal
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            setInvitesKey((k) => k + 1);
            load();
          }}
        />
      )}
    </div>
  );
}
