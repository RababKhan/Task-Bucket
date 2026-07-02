"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSprints,
  useProjectTasks,
  useMembers,
  useProjects,
} from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import type { Sprint } from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskListTable, { type ListTask } from "@/components/app/TaskListTable";
import CreateSprintModal, {
  type EditSprint,
} from "@/components/app/CreateSprintModal";

type SprintWithCount = Sprint & { task_count: number };

function today() {
  return new Date().toISOString().slice(0, 10);
}

// "23/May/2023" — matches the sprint header date-range style.
function fmtSprintDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "—";
  const mon = d.toLocaleString("en-US", { month: "short" });
  return `${String(d.getDate()).padStart(2, "0")} ${mon} ${d.getFullYear()}`;
}

// The Sprint view for a project. Rendered as the `view=sprint` tab of the board
// page so it shares the same URL shape as List/Board (/?project=ID&view=sprint).
export default function SprintView({ projectId }: { projectId: number }) {
  const router = useRouter();

  const queryClient = useQueryClient();
  // Shared caches — tasks/members/projects keys match the board view, so
  // switching List/Board ↔ Sprint reuses already-fetched data.
  const sprintsQuery = useSprints<SprintWithCount>(projectId);
  const tasksQuery = useProjectTasks<ListTask>(projectId);
  const membersQuery = useMembers(projectId);
  const projectsQuery = useProjects<{ id: number; name: string }>();

  const sprints = sprintsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const projectName =
    projectsQuery.data?.find((p) => p.id === projectId)?.name ?? "";
  // Tasks mirror the shared cache but stay in local state so inline optimistic
  // edits apply instantly.
  const [tasks, setTasks] = useState<ListTask[]>([]);
  const loading = sprintsQuery.isLoading || tasksQuery.isLoading;
  const [showCreate, setShowCreate] = useState(false);
  const [editSprint, setEditSprint] = useState<EditSprint | null>(null);
  const [query, setQuery] = useState("");
  // Per-sprint UI state: which are collapsed, which kebab is open, and the
  // inline "add item" composer.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  // Persist the collapsed sprints per project so the state survives a refresh.
  const collapseKey = `tb-sprint-collapsed-${projectId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(collapseKey);
      setCollapsed(raw ? new Set<number>(JSON.parse(raw)) : new Set());
    } catch {
      setCollapsed(new Set());
    }
  }, [collapseKey]);

  function saveCollapsed(next: Set<number>) {
    try {
      localStorage.setItem(collapseKey, JSON.stringify([...next]));
    } catch {}
  }

  const toggleCollapse = (id: number) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });

  // Invalidate the shared sprint + task caches; the mirror effect repopulates
  // local `tasks`, and `sprints` re-derives from its query automatically.
  const load = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sprints(projectId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectTasks(projectId),
        }),
      ]),
    [queryClient, projectId]
  );

  // Mirror the shared tasks cache into local state for optimistic updates.
  useEffect(() => {
    if (tasksQuery.data) setTasks(tasksQuery.data);
  }, [tasksQuery.data]);

  const projectPrefix = useMemo(
    () =>
      projectName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() ||
      "TSK",
    [projectName]
  );

  const labelSuggestions = useMemo(
    () =>
      [...new Set(tasks.flatMap((t) => t.labels ?? []))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tasks]
  );

  const tasksBySprint = useMemo(() => {
    const map = new Map<number, ListTask[]>();
    for (const t of tasks) {
      if (t.sprint_id != null) {
        const arr = map.get(t.sprint_id) ?? [];
        arr.push(t);
        map.set(t.sprint_id, arr);
      }
    }
    return map;
  }, [tasks]);

  async function updateTask(id: number, patch: Record<string, unknown>) {
    setTasks((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...patch } as ListTask) : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }


  async function patchSprint(id: number, fields: Partial<Sprint>) {
    await fetch(`/api/sprints/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await load();
  }

  async function deleteSprint(s: Sprint) {
    if (!window.confirm(`Delete "${s.name}"? Its tasks return to the backlog.`))
      return;
    await fetch(`/api/sprints/${s.id}`, { method: "DELETE" });
    await load();
  }

  // Bulk-delete selected tasks from a sprint card.
  async function deleteTasks(ids: number[]) {
    setTasks((cur) => cur.filter((t) => !ids.includes(t.id)));
    await Promise.all(
      ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }))
    );
    await load();
  }

  // Create a task in a sprint from just a title (used by the table footer).
  async function addTaskToSprint(sprintId: number, title: string) {
    const t = title.trim();
    if (!t) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, title: t, sprint_id: sprintId }),
    });
    await load();
  }

  // Quick-add a task straight into a sprint.
  async function addItem(sprintId: number) {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, title, sprint_id: sprintId }),
    });
    setNewTitle("");
    setAdding(false);
    setAddingFor(null);
    await load();
  }

  async function setTaskSprint(taskId: number, sprintId: number | null) {
    setTasks((cur) =>
      cur.map((t) => (t.id === taskId ? { ...t, sprint_id: sprintId } : t))
    );
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprint_id: sprintId }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="sprints">
      {sprints.length > 0 && (
        <div className="sprints-head">
          <button className="pv-tool-btn" onClick={() => setShowCreate(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Sprint
          </button>
          <div className="proj-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
            />
            {query && (
              <button
                type="button"
                className="proj-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sprints-scroll">
      {sprints.length === 0 && (
        <div className="empty-hero task-empty">
          <div className="empty-box">
            <span className="empty-cubes task-empty-ill">
              {/* Sprint goal = a target/bullseye; the center is accent-colored. */}
              <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="60" cy="60" r="44" />
                <circle cx="60" cy="60" r="27" />
                <circle className="cubes-grid" cx="60" cy="60" r="11" />
              </svg>
            </span>
            <h2>No sprints yet</h2>
            <p>
              Sprints help you plan work into short, focused cycles. Create your
              first sprint to start organizing tasks here.
            </p>
            <div className="empty-actions">
              <button
                className="empty-create-btn"
                onClick={() => setShowCreate(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Create New Sprint
              </button>
              <a
                className="empty-doc-btn"
                href="https://github.com/RababKhan/Task-Bucket"
                target="_blank"
                rel="noopener noreferrer"
              >
                Documentation
              </a>
            </div>
          </div>
        </div>
      )}

      {(query.trim()
        ? sprints.filter((s) =>
            s.name.toLowerCase().includes(query.trim().toLowerCase())
          )
        : sprints
      ).map((s) => {
        const items = tasksBySprint.get(s.id) ?? [];
        const isCollapsed = collapsed.has(s.id);
        const hasDates = !!(s.start_date || s.end_date);
        // End/Start Sprint + Add Item — borderless; shown in the header while
        // collapsed, and on the date row once the card is expanded.
        const actionButtons = (
          <>
            {s.status === "planned" && (
              <button
                className="sprint-act-btn"
                onClick={() =>
                  patchSprint(s.id, { status: "active", start_date: today() })
                }
              >
                Start Sprint
              </button>
            )}
            {s.status === "active" && (
              <button
                className="sprint-act-btn"
                onClick={() =>
                  patchSprint(s.id, { status: "completed", end_date: today() })
                }
              >
                End Sprint
              </button>
            )}
            <button
              className="sprint-act-btn sprint-additem"
              onClick={() => {
                setCollapsed((c) => {
                  const n = new Set(c);
                  n.delete(s.id);
                  saveCollapsed(n);
                  return n;
                });
                setAddingFor(s.id);
                setNewTitle("");
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Item
            </button>
          </>
        );
        return (
          <section key={s.id} className="sprint-card">
            <div className="sprint-card-head">
              <button
                type="button"
                className={`sprint-toggle${isCollapsed ? "" : " open"}`}
                onClick={() => toggleCollapse(s.id)}
                aria-label={isCollapsed ? "Expand sprint" : "Collapse sprint"}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 10.5 3.5 3.5 3.5-3.5" />
                </svg>
              </button>
              <div className="sprint-card-title">
                <h3>{s.name}</h3>
                <span className="sprint-count-badge">{items.length}</span>
              </div>
              <div className="sprint-actions">
                {actionButtons}
                <div className="sprint-kebab-wrap">
                  <button
                    className={`pv-kebab${menuFor === s.id ? " open" : ""}`}
                    aria-label="Sprint actions"
                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <circle cx="12" cy="5" r="1.8" />
                      <circle cx="12" cy="12" r="1.8" />
                      <circle cx="12" cy="19" r="1.8" />
                    </svg>
                  </button>
                  {menuFor === s.id && (
                    <>
                      <div className="pv-menu-backdrop" onClick={() => setMenuFor(null)} />
                      <div className="pv-menu">
                        <button
                          className="pv-menu-item"
                          onClick={() => {
                            setMenuFor(null);
                            setEditSprint({
                              id: s.id,
                              name: s.name,
                              goal: s.goal,
                              start_date: s.start_date,
                              end_date: s.end_date,
                            });
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Edit sprint
                        </button>
                        <button
                          className="pv-menu-item danger"
                          onClick={() => {
                            setMenuFor(null);
                            deleteSprint(s);
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6M14 11v6" />
                          </svg>
                          Delete sprint
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {!isCollapsed && (
              <div className="sprint-body">
                {hasDates && (
                  <div className="sprint-dates">
                    {fmtSprintDate(s.start_date)} – {fmtSprintDate(s.end_date)}
                  </div>
                )}
                {s.goal && <p className="sprint-goal">{s.goal}</p>}
                {addingFor === s.id && (
                  <div className="sprint-additem-row">
                    <input
                      autoFocus
                      className="cf-input"
                      value={newTitle}
                      placeholder="Task name, then Enter"
                      disabled={adding}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addItem(s.id);
                        else if (e.key === "Escape") {
                          setAddingFor(null);
                          setNewTitle("");
                        }
                      }}
                    />
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => addItem(s.id)}
                      disabled={adding || !newTitle.trim()}
                    >
                      {adding ? <Spinner /> : "Add"}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        setAddingFor(null);
                        setNewTitle("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <TaskListTable
                  tasks={items}
                  members={members}
                  labelSuggestions={labelSuggestions}
                  projectPrefix={projectPrefix}
                  onUpdate={updateTask}
                  onOpen={(id) => router.push(`/task/${id}`)}
                  onDelete={deleteTasks}
                  onAddItem={(title) => addTaskToSprint(s.id, title)}
                  emptyText="No tasks in this sprint."
                  menuItems={(t) => [
                    {
                      label: "Remove from sprint",
                      danger: true,
                      onClick: () => setTaskSprint(t.id, null),
                    },
                  ]}
                />
              </div>
            )}
          </section>
        );
      })}
      </div>

      {(showCreate || editSprint) && (
        <CreateSprintModal
          projectId={projectId}
          sprint={editSprint ?? undefined}
          onClose={() => {
            setShowCreate(false);
            setEditSprint(null);
          }}
          onCreated={() => {
            setShowCreate(false);
            setEditSprint(null);
            load();
          }}
        />
      )}
    </div>
  );
}
