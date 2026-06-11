"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project, ProjectStatus, Member } from "@/lib/types";
import Spinner from "@/components/Spinner";
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
  const [menuId, setMenuId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

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

  const createProject = () => setModalOpen(true);

  useEffect(() => {
    const open = () => setModalOpen(true);
    window.addEventListener("tb:create-project", open);
    return () => window.removeEventListener("tb:create-project", open);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

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

  async function confirmDelete() {
    const p = deleteTarget;
    if (!p) return;
    setDeleteTarget(null);
    setProjects((cur) => cur.filter((x) => x.id !== p.id));
    setSelected((cur) => {
      const next = new Set(cur);
      next.delete(p.id);
      return next;
    });
    await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
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
        <button className="pv-tool-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18M7 12h10M11 18h2" />
          </svg>
          Filter
        </button>
        <button className="pv-tool-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7h12M3 12h8M3 17h4M17 5v14M17 19l3-3M17 19l-3-3" />
          </svg>
          Sort
        </button>
        <button className="pv-tool-btn pv-view" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          View
        </button>
      </div>

      {/* Table */}
      <div className="pv-table">
        <div className="pv-head">
          <span aria-hidden />
          <span>Name</span>
          <span>Status</span>
          <span>Due Date</span>
          <span>PM</span>
          <span>Member</span>
          <span>Progress</span>
          <span aria-hidden />
        </div>

        {filtered.map((p) => {
          const overdue =
            p.due_date &&
            p.status !== "completed" &&
            p.status !== "cancelled" &&
            p.due_date < today;
          return (
            <div
              key={p.id}
              className={`pv-row${dragId === p.id ? " dragging" : ""}${dragOverId === p.id ? " dragover" : ""}${selected.has(p.id) ? " selected" : ""}`}
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

              <span className="pv-cell pv-title-cell">
                <span className="pv-title">{p.name}</span>
              </span>

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

              <span className="pv-cell pv-progress">{p.progress}%</span>

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

        {filtered.length === 0 && (
          <div className="pv-noresult">No projects match “{query}”.</div>
        )}
      </div>

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

      {deleteTarget && (
        <div className="overlay" onMouseDown={() => setDeleteTarget(null)}>
          <div
            className="modal confirm-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="confirm-close"
              onClick={() => setDeleteTarget(null)}
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>

            <span className="confirm-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </span>

            <h2>Delete Project</h2>
            <p className="confirm-text">
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.name}</strong>? This action cannot be undone.
              Any tasks associated with this project will also be deleted.
            </p>

            <div className="confirm-actions">
              <button
                className="btn btn-primary confirm-keep"
                onClick={() => setDeleteTarget(null)}
              >
                No, Keep it
              </button>
              <button className="btn-outline confirm-del" onClick={confirmDelete}>
                Yes, Delete it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
