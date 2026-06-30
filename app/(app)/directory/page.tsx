"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import { usePerms } from "@/components/app/PermissionProvider";
import InviteMemberModal from "@/components/app/team/InviteMemberModal";
import PendingInvites from "@/components/app/team/PendingInvites";
import { MEMBER_STATUS_LABELS, type TeamMember } from "@/lib/types";

type RoleOption = { key: string; name: string };
type ProjectOption = { id: number; name: string };

// Column layout for the grid table (mirrors the Projects view's pv-table).
const GRID = "1.6fr 150px 90px 120px 120px 130px";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const PAGE_SIZE = 20;

export default function DirectoryPage() {
  const perms = usePerms();
  const router = useRouter();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [canInvite, setCanInvite] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [canCancel, setCanCancel] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showInvite, setShowInvite] = useState(false);
  const [invitesKey, setInvitesKey] = useState(0);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, roleFilter, projectFilter, statusFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (roleFilter) params.set("role", roleFilter);
    if (projectFilter) params.set("project", projectFilter);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    const res = await fetch(`/api/team/members?${params.toString()}`);
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setMembers(data.members ?? []);
    setRoles(data.roles ?? []);
    setProjects(data.projects ?? []);
    setTotal(data.total ?? 0);
    setCanInvite(!!data.can_invite);
    setCanResend(!!data.can_resend);
    setCanCancel(!!data.can_cancel);
    setLoading(false);
  }, [debouncedQ, roleFilter, projectFilter, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  if (perms.loaded && !perms.can("team_member", "view")) {
    return (
      <AccessDenied message="You do not have permission to view team members." />
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = !!(q || roleFilter || projectFilter || statusFilter);

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

        <select
          className="pv-tool-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="pv-tool-select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="pv-tool-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

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
          <div className="pv-head" style={{ gridTemplateColumns: GRID }}>
            <span>Member</span>
            <span>Role</span>
            <span>Projects</span>
            <span>Status</span>
            <span>Joined</span>
            <span>Last Active</span>
          </div>

          {members.map((m) => {
            const statusKey = m.active ? "active" : "inactive";
            return (
              <div
                key={m.user_id}
                className="pv-row"
                style={{ gridTemplateColumns: GRID }}
                onClick={() => router.push(`/directory/${m.user_id}`)}
              >
                <span className="pv-cell pv-title-cell">
                  <span className="pv-avatar">
                    {initials(m.name || m.email || "?")}
                  </span>
                  <span className="dir-name-wrap">
                    <span className="pv-title">{m.name || m.email}</span>
                    <span className="dir-sub">{m.email}</span>
                  </span>
                </span>
                <span className="pv-cell">
                  <span className={`role-pill role-${m.role}`}>{m.role_name}</span>
                </span>
                <span className="pv-cell pv-progress">{m.project_count}</span>
                <span className="pv-cell">
                  <span className={`status-badge status-${statusKey}`}>
                    {MEMBER_STATUS_LABELS[statusKey]}
                  </span>
                </span>
                <span className="pv-cell dir-muted">{fmtDate(m.joined_at)}</span>
                <span className="pv-cell dir-muted">
                  {fmtDate(m.last_active_at)}
                </span>
              </div>
            );
          })}
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

      <PendingInvites
        canResend={canResend}
        canCancel={canCancel}
        refreshKey={invitesKey}
      />

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
