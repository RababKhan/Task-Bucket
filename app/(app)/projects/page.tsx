"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ProjectStatus, Member } from "@/lib/types";
import { PROJECT_STATUS_ORDER, PROJECT_STATUS_LABELS } from "@/lib/types";
import Spinner from "@/components/Spinner";
import StatusIcon from "@/components/app/StatusIcon";
import StatusDropdown from "@/components/app/StatusDropdown";
import MemberPicker from "@/components/app/MemberPicker";
import DatePicker from "@/components/app/DatePicker";
import EmptyProjects from "@/components/app/EmptyProjects";
import CreateProjectModal from "@/components/app/CreateProjectModal";

type Person = { user_id: string; name: string; email: string };
type ProjectRow = Project & {
  task_count: number;
  done_count: number;
  progress: number;
  owner: Person | null;
  manager: Person | null;
  members: Person[];
};

type ColKey = "name" | "status" | "due" | "pm" | "member" | "progress";
const COLUMNS: { key: ColKey; label: string; width: string }[] = [
  { key: "name", label: "Project Name", width: "1fr" },
  { key: "status", label: "Status", width: "130px" },
  { key: "due", label: "Due Date", width: "110px" },
  { key: "pm", label: "Project Manager", width: "70px" },
  { key: "member", label: "Members", width: "120px" },
  { key: "progress", label: "Progress", width: "80px" },
];
const HEAD: Record<ColKey, string> = {
  name: "Name",
  status: "Status",
  due: "Due Date",
  pm: "PM",
  member: "Member",
  progress: "Progress",
};
const PAGE_SIZES = [10, 25, 50, 100];
type SortKey = "name" | "status" | "due" | "progress";
const SORT_FIELDS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "due", label: "Due Date" },
  { key: "progress", label: "Progress" },
];
const DEFAULT_VISIBLE: Record<ColKey, boolean> = {
  name: true,
  status: true,
  due: true,
  pm: true,
  member: true,
  progress: true,
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<ProjectStatus>>(
    new Set()
  );
  const [pendingStatus, setPendingStatus] = useState<Set<ProjectStatus>>(
    new Set()
  );
  const [filterApplying, setFilterApplying] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewOpen, setViewOpen] = useState(false);
  const [viewClosing, setViewClosing] = useState(false);
  const [viewSaving, setViewSaving] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>(DEFAULT_VISIBLE);

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .catch(() => {});
  }, []);

  // Load saved view preferences (page size + visible columns).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tb-projects-view");
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v.pageSize === "number") setPageSize(v.pageSize);
        if (v.visible) setVisible({ ...DEFAULT_VISIBLE, ...v.visible, name: true });
      }
    } catch {}
  }, []);

  // Load saved filter + sort.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tb-projects-filtersort");
      if (raw) {
        const v = JSON.parse(raw);
        if (Array.isArray(v.status)) setStatusFilter(new Set(v.status));
        if (v.sortBy) setSortBy(v.sortBy);
        if (v.sortDir === "asc" || v.sortDir === "desc") setSortDir(v.sortDir);
      }
    } catch {}
  }, []);

  // Persist filter + sort whenever they change (skip the initial mount).
  const fsHydrated = useRef(false);
  useEffect(() => {
    if (!fsHydrated.current) {
      fsHydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(
        "tb-projects-filtersort",
        JSON.stringify({ status: [...statusFilter], sortBy, sortDir })
      );
    } catch {}
  }, [statusFilter, sortBy, sortDir]);

  function closeView() {
    if (viewClosing) return;
    setViewClosing(true);
    window.setTimeout(() => {
      setViewOpen(false);
      setViewClosing(false);
    }, 220);
  }

  function saveView() {
    if (viewSaving) return;
    setViewSaving(true);
    window.setTimeout(() => {
      try {
        localStorage.setItem(
          "tb-projects-view",
          JSON.stringify({ pageSize, visible })
        );
      } catch {}
      setViewSaving(false);
      closeView();
    }, 550);
  }

  function resetView() {
    setPageSize(50);
    setVisible(DEFAULT_VISIBLE);
  }

  const visibleCols = COLUMNS.filter((c) => visible[c.key]);
  const gridCols = `34px ${visibleCols.map((c) => c.width).join(" ")} 32px`;

  const createProject = () => setModalOpen(true);

  useEffect(() => {
    const open = () => setModalOpen(true);
    window.addEventListener("tb:create-project", open);
    return () => window.removeEventListener("tb:create-project", open);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q)) &&
        (statusFilter.size === 0 ||
          statusFilter.has(p.status as ProjectStatus))
    );
  }, [projects, query, statusFilter]);

  function openFilter() {
    setPendingStatus(new Set(statusFilter));
    setFilterOpen(true);
  }

  function togglePending(s: ProjectStatus) {
    setPendingStatus((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function applyFilter() {
    if (filterApplying) return;
    setFilterApplying(true);
    window.setTimeout(() => {
      setStatusFilter(new Set(pendingStatus));
      setFilterApplying(false);
      setFilterOpen(false);
    }, 550);
  }

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (p: ProjectRow): string | number => {
      switch (sortBy) {
        case "name":
          return p.name.toLowerCase();
        case "status":
          return PROJECT_STATUS_ORDER.indexOf(p.status as ProjectStatus);
        case "due":
          return p.due_date ?? "9999-99-99";
        case "progress":
          return p.progress;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [filtered, sortBy, sortDir]);

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

  function clearAll() {
    setStatusFilter(new Set());
    setSortBy(null);
    setSortOpen(false);
    setFilterOpen(false);
  }

  async function changeStatus(id: number, status: ProjectStatus) {
    setProjects((cur) => cur.map((p) => (p.id === id ? { ...p, status } : p)));
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function changeManager(id: number, managerUserId: string | null) {
    setProjects((cur) =>
      cur.map((p) => {
        if (p.id !== id) return p;
        const m = managerUserId
          ? members.find((x) => x.user_id === managerUserId)
          : null;
        return {
          ...p,
          manager_id: managerUserId,
          manager: m
            ? { user_id: m.user_id, name: m.name ?? "", email: m.email ?? "" }
            : null,
        };
      })
    );
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manager_id: managerUserId }),
    });
  }

  async function changeMembers(id: number, ids: string[]) {
    setProjects((cur) =>
      cur.map((p) => {
        if (p.id !== id) return p;
        const mems = ids
          .map((uid) => members.find((x) => x.user_id === uid))
          .filter(Boolean)
          .map((m) => ({
            user_id: m!.user_id,
            name: m!.name ?? "",
            email: m!.email ?? "",
          }));
        return { ...p, members: mems };
      })
    );
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_ids: ids }),
    });
  }

  function toggleSelect(id: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function drop(targetId: number) {
    setProjects((cur) => {
      if (dragId == null || dragId === targetId) return cur;
      const arr = [...cur];
      const from = arr.findIndex((p) => p.id === dragId);
      const to = arr.findIndex((p) => p.id === targetId);
      if (from < 0 || to < 0) return cur;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
    setDragId(null);
    setDragOverId(null);
  }

  async function changeDate(id: number, due: string) {
    setProjects((cur) =>
      cur.map((p) => (p.id === id ? { ...p, due_date: due || null } : p))
    );
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ due_date: due || null }),
    });
  }

  function editSelected() {
    if (selected.size !== 1) return;
    const id = [...selected][0];
    const p = projects.find((x) => x.id === id);
    if (p) setEditTarget(p);
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      if (bulkDelete) {
        const ids = [...selected];
        await Promise.all(
          ids.map((id) => fetch(`/api/projects/${id}`, { method: "DELETE" }))
        );
        setProjects((cur) => cur.filter((x) => !ids.includes(x.id)));
        setSelected(new Set());
        setBulkDelete(false);
      } else if (deleteTarget) {
        const id = deleteTarget.id;
        await fetch(`/api/projects/${id}`, { method: "DELETE" });
        setProjects((cur) => cur.filter((x) => x.id !== id));
        setSelected((cur) => {
          const next = new Set(cur);
          next.delete(id);
          return next;
        });
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <>
        <EmptyProjects onCreate={createProject} />
        {modalOpen && (
          <CreateProjectModal
            onClose={() => setModalOpen(false)}
            onCreated={(p) => {
              setModalOpen(false);
              router.push(`/?project=${p.id}`);
            }}
          />
        )}
      </>
    );
  }

  const today = todayISO();

  return (
    <div className="pv">
      {/* Toolbar */}
      <div className="pv-toolbar">
        <div className="pv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
          />
        </div>
        <div className="pv-sort">
          <button
            className={`pv-tool-btn${statusFilter.size ? " active" : ""}`}
            type="button"
            onClick={() => (filterOpen ? setFilterOpen(false) : openFilter())}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18M7 12h10M11 18h2" />
            </svg>
            Filter
            {statusFilter.size > 0 && (
              <span className="pv-sort-tag">{statusFilter.size}</span>
            )}
          </button>
          {filterOpen && (
            <>
              <div className="pv-menu-backdrop" onClick={() => setFilterOpen(false)} />
              <div className="pv-filter-pop">
                <div className="pv-filter-list">
                  {PROJECT_STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`pv-filter-opt${pendingStatus.has(s) ? " sel" : ""}`}
                      onClick={() => togglePending(s)}
                    >
                      <StatusIcon status={s} size={16} />
                      <span>{PROJECT_STATUS_LABELS[s]}</span>
                      {pendingStatus.has(s) && (
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
            {sortBy && <span className="pv-sort-tag">{SORT_FIELDS.find((f) => f.key === sortBy)?.label}</span>}
          </button>
          {sortOpen && (
            <>
              <div className="pv-menu-backdrop" onClick={() => setSortOpen(false)} />
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
                    Clear sort
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {(statusFilter.size > 0 || sortBy) && (
          <button className="pv-tool-btn pv-clear-all" type="button" onClick={clearAll}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M15 9l-6 6M9 9l6 6" />
            </svg>
            Clear all
          </button>
        )}
        <button
          className="pv-tool-btn pv-view"
          type="button"
          onClick={() => setViewOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          View
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        query.trim() ? (
          <div className="pv-empty-search">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="27" cy="27" r="18" />
              <path d="M40 40l15 15" />
              <circle cx="21" cy="24" r="1.4" fill="currentColor" stroke="none" />
              <circle cx="33" cy="24" r="1.4" fill="currentColor" stroke="none" />
              <path d="M22 34c2.5-3 7.5-3 10 0" />
            </svg>
            <p>
              We couldn&apos;t find any result matching &ldquo;{query.trim()}
              &rdquo;
            </p>
          </div>
        ) : (
          <div className="pv-empty-search pv-empty-filter">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 20a4 4 0 0 1 4-4h12l5 6h19a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V20Z" />
              <path d="M24 38h16" />
            </svg>
            <p>No projects match the selected filter.</p>
            <button className="pv-empty-clear" onClick={clearAll}>
              Clear filter
            </button>
          </div>
        )
      ) : (
      <div className="pv-table">
        {selected.size > 0 && (
          <div className="pv-selbar">
            <span className="pv-selcount">{selected.size}</span>
            {selected.size === 1 && (
              <button className="pv-selact" onClick={editSelected}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Edit
              </button>
            )}
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

        <div className="pv-head" style={{ gridTemplateColumns: gridCols }}>
          <span aria-hidden />
          {visibleCols.map((c) => (
            <span key={c.key}>{HEAD[c.key]}</span>
          ))}
          <span aria-hidden />
        </div>

        {sorted.slice(0, pageSize).map((p) => {
          const overdue =
            p.due_date &&
            p.status !== "completed" &&
            p.status !== "cancelled" &&
            p.due_date < today;
          return (
            <div
              key={p.id}
              className={`pv-row${dragId === p.id ? " dragging" : ""}${dragOverId === p.id ? " dragover" : ""}${selected.has(p.id) ? " selected" : ""}`}
              style={{ gridTemplateColumns: gridCols }}
              draggable
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverId !== p.id) setDragOverId(p.id);
              }}
              onDrop={() => drop(p.id)}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
              }}
              onClick={() => router.push(`/?project=${p.id}`)}
            >
              <span className="pv-ctrl">
                <span className="pv-drag-handle" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                  </svg>
                </span>
                <input
                  type="checkbox"
                  className="pv-check"
                  checked={selected.has(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(p.id)}
                  aria-label={`Select ${p.name}`}
                />
              </span>

              {visible.name && (
                <span className="pv-cell pv-title-cell">
                  <span className="pv-title">{p.name}</span>
                </span>
              )}

              {visible.status && (
                <span
                  className="pv-cell pv-status"
                  onClick={(e) => e.stopPropagation()}
                >
                  <StatusDropdown
                    value={p.status as ProjectStatus}
                    onChange={(s) => changeStatus(p.id, s)}
                    variant="inline"
                  />
                </span>
              )}

              {visible.due && (
                <span
                  className={`pv-cell pv-date${overdue ? " overdue" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <DatePicker
                    inline
                    value={p.due_date ?? ""}
                    onChange={(v) => changeDate(p.id, v)}
                  />
                </span>
              )}

              {visible.pm && (
                <span className="pv-cell pv-lead" onClick={(e) => e.stopPropagation()}>
                  <MemberPicker
                    inline
                    members={members}
                    value={p.manager_id ? [p.manager_id] : []}
                    onChange={(ids) => changeManager(p.id, ids[0] ?? null)}
                    placeholder="Manager"
                    allowNone
                    searchable={false}
                  />
                </span>
              )}

              {visible.member && (
                <span className="pv-cell pv-members" onClick={(e) => e.stopPropagation()}>
                  <MemberPicker
                    inline
                    multiple
                    members={members}
                    value={p.members.map((m) => m.user_id)}
                    onChange={(ids) => changeMembers(p.id, ids)}
                    placeholder="Members"
                  />
                </span>
              )}

              {visible.progress && (
                <span className="pv-cell pv-progress">{p.progress}%</span>
              )}

              <button
                className={`pv-kebab${menuId === p.id ? " open" : ""}`}
                aria-label="Row actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === p.id ? null : p.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {menuId === p.id && (
                <>
                  <div
                    className="pv-menu-backdrop"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuId(null);
                    }}
                  />
                  <div className="pv-menu" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="pv-menu-item"
                      onClick={() => {
                        setMenuId(null);
                        setEditTarget(p);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      className="pv-menu-item danger"
                      onClick={() => {
                        setMenuId(null);
                        setDeleteTarget(p);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      )}

      {modalOpen && (
        <CreateProjectModal
          onClose={() => setModalOpen(false)}
          onCreated={(p) => {
            setModalOpen(false);
            router.push(`/?project=${p.id}`);
          }}
        />
      )}

      {editTarget && (
        <CreateProjectModal
          project={{
            id: editTarget.id,
            name: editTarget.name,
            description: editTarget.description,
            status: editTarget.status as ProjectStatus,
            start_date: editTarget.start_date,
            due_date: editTarget.due_date,
            manager_id: editTarget.manager_id,
            member_ids: editTarget.members.map((m) => m.user_id),
          }}
          onClose={() => setEditTarget(null)}
          onCreated={() => {
            setEditTarget(null);
            load();
          }}
        />
      )}

      {(deleteTarget || bulkDelete) && (
        <div
          className="overlay"
          onMouseDown={() => {
            setDeleteTarget(null);
            setBulkDelete(false);
          }}
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

            <h2>
              Delete {bulkDelete && selected.size > 1 ? "Projects" : "Project"}
            </h2>
            <p className="confirm-text">
              Are you sure you want to delete{" "}
              {bulkDelete ? (
                <strong>
                  {selected.size} project{selected.size === 1 ? "" : "s"}
                </strong>
              ) : (
                <strong>{deleteTarget!.name}</strong>
              )}
              ? This action cannot be undone. Any tasks associated will also be
              deleted.
            </p>

            <div className="confirm-actions">
              <button
                className="btn btn-primary confirm-keep"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null);
                  setBulkDelete(false);
                }}
              >
                No, Keep it
              </button>
              <button
                className="btn-outline confirm-del"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? <Spinner /> : "Yes, Delete it"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewOpen && (
        <div className="pv-drawer-overlay" onMouseDown={closeView}>
          <aside
            className={`pv-drawer${viewClosing ? " closing" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="pv-drawer-head">
              <span className="pv-drawer-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                View
              </span>
            </div>

            <div className="pv-drawer-body">
              <section className="pv-drawer-sec">
                <h4>Selected Page Size</h4>
                <div className="pv-pagesizes">
                  {PAGE_SIZES.map((n) => (
                    <label key={n} className="pv-radio">
                      <input
                        type="radio"
                        name="pv-pagesize"
                        checked={pageSize === n}
                        onChange={() => setPageSize(n)}
                      />
                      <span>{n} items</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="pv-drawer-sec">
                <h4>Visible Columns</h4>
                <div className="pv-collist">
                  <div className="pv-collist-head">
                    <span>Columns Name</span>
                    <span>Show</span>
                  </div>
                  {COLUMNS.map((c) => (
                    <label key={c.key} className="pv-colrow">
                      <span>{c.label}</span>
                      <input
                        type="checkbox"
                        className="pv-check"
                        checked={visible[c.key]}
                        disabled={c.key === "name"}
                        onChange={() =>
                          setVisible((v) => ({ ...v, [c.key]: !v[c.key] }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="pv-drawer-foot">
              <button className="btn" onClick={resetView}>
                Reset
              </button>
              <button
                className="btn btn-primary"
                onClick={saveView}
                disabled={viewSaving}
              >
                {viewSaving ? <Spinner /> : "Save"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
