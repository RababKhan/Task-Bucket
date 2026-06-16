"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Member, Project, Task, TaskStatus } from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PROJECT_STATUS_LABELS,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskModal, { type TaskDraft } from "@/app/TaskModal";
import ProjectTabs from "@/components/app/ProjectTabs";
import StatusIcon from "@/components/app/StatusIcon";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import SelectField, { type SelectOption } from "@/components/app/SelectField";
import MemberPicker from "@/components/app/MemberPicker";
import DatePicker from "@/components/app/DatePicker";
import LabelsField from "@/components/app/LabelsField";
import EmptyProjects from "@/components/app/EmptyProjects";
import CreateProjectModal from "@/components/app/CreateProjectModal";

type ProjectWithCount = Project & {
  task_count: number;
  progress: number;
};
type BoardTask = Task & {
  subtask_total?: number;
  subtask_done?: number;
  assignees?: string[];
};

const PRIO_COLOR: Record<string, string> = {
  critical: "var(--prio-critical)",
  high: "var(--prio-high)",
  medium: "var(--prio-medium)",
  low: "var(--prio-low)",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_OPTS: SelectOption[] = STATUS_ORDER.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  icon: <TaskStatusIcon status={s} size={15} />,
}));
const PRIORITY_OPTS: SelectOption[] = PRIORITY_ORDER.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
  icon: <PriorityIcon priority={p} size={14} />,
}));

function BoardPage() {
  const params = useSearchParams();
  const router = useRouter();
  const urlProject = params.get("project");
  const view: "board" | "list" = params.get("view") === "list" ? "list" : "board";

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);

  const [editing, setEditing] = useState<BoardTask | null>(null);
  const [creatingStatus, setCreatingStatus] = useState<TaskStatus | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);

  // List-table row controls (selection, drag-reorder, kebab, delete).
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [taskMenuId, setTaskMenuId] = useState<number | null>(null);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data: ProjectWithCount[] = await res.json();
    setProjects(data);
    setActiveId((cur) => {
      if (cur && data.some((p) => p.id === cur)) return cur;
      const pid = Number(urlProject);
      if (pid && data.some((p) => p.id === pid)) return pid;
      return data[0]?.id ?? null;
    });
    return data;
  }, [urlProject]);

  const loadTasks = useCallback(async (projectId: number) => {
    const res = await fetch(`/api/tasks?project_id=${projectId}`);
    setTasks(await res.json());
  }, []);

  useEffect(() => {
    loadProjects().finally(() => setLoading(false));
  }, [loadProjects]);

  // React to ?project= changes from search / project list navigation.
  useEffect(() => {
    if (urlProject) setActiveId(Number(urlProject));
  }, [urlProject]);

  useEffect(() => {
    if (activeId != null) loadTasks(activeId);
    else setTasks([]);
  }, [activeId, loadTasks]);

  // Workspace members assignable to this project's tasks.
  useEffect(() => {
    if (activeId == null) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/members?project_id=${activeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setMembers(Array.isArray(d.members) ? d.members : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  // Broadcast the active project name so the topbar can show a breadcrumb.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("tb:active-project", {
        detail: activeProject ? { name: activeProject.name } : null,
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("tb:active-project", { detail: null })
      );
    };
  }, [activeProject]);

  // ---- Project actions ----
  const createProject = () => setCreateOpen(true);

  function onProjectCreated(p: Project) {
    setCreateOpen(false);
    // Optimistically show the new (empty) project right away — no spinner, no
    // empty-state flash. Reconcile the list in the background. Land on the
    // List view.
    setProjects((cur) =>
      cur.some((x) => x.id === p.id)
        ? cur
        : [{ ...p, task_count: 0, progress: 0 }, ...cur]
    );
    setActiveId(p.id);
    void loadProjects();
    router.push(`/?project=${p.id}&view=list`);
  }

  async function renameProject() {
    if (!activeProject) return;
    const name = window.prompt("Project name", activeProject.name);
    if (name === null) return;
    const description =
      window.prompt("Description", activeProject.description) ??
      activeProject.description;
    await fetch(`/api/projects/${activeProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    await loadProjects();
  }

  async function deleteProject() {
    if (!activeProject) return;
    if (
      !window.confirm(
        `Delete "${activeProject.name}" and all its tasks? This cannot be undone.`
      )
    )
      return;
    setDeletingProject(true);
    try {
      await fetch(`/api/projects/${activeProject.id}`, { method: "DELETE" });
      await loadProjects();
    } finally {
      setDeletingProject(false);
    }
  }

  // ---- Task actions ----
  async function saveTask(draft: TaskDraft) {
    if (editing) {
      await fetch(`/api/tasks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } else if (activeId != null) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, project_id: activeId }),
      });
    }
    setEditing(null);
    setCreatingStatus(null);
    if (activeId != null) await loadTasks(activeId);
    await loadProjects(); // refresh counts
  }

  async function deleteTask() {
    if (!editing) return;
    await fetch(`/api/tasks/${editing.id}`, { method: "DELETE" });
    setEditing(null);
    if (activeId != null) await loadTasks(activeId);
    await loadProjects();
  }

  function toggleSelectTask(id: number) {
    setSelectedTasks((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dropTask(targetId: number) {
    setTasks((cur) => {
      if (dragTaskId == null || dragTaskId === targetId) return cur;
      const arr = [...cur];
      const from = arr.findIndex((t) => t.id === dragTaskId);
      const to = arr.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0) return cur;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
    setDragTaskId(null);
    setDragOverTaskId(null);
  }

  async function deleteTaskById(id: number) {
    setTasks((cur) => cur.filter((t) => t.id !== id));
    setSelectedTasks((cur) => {
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await loadProjects();
  }

  async function deleteSelectedTasks() {
    const ids = [...selectedTasks];
    if (!ids.length) return;
    setTasks((cur) => cur.filter((t) => !ids.includes(t.id)));
    setSelectedTasks(new Set());
    await Promise.all(
      ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }))
    );
    await loadProjects();
  }

  // Inline edits from the list table.
  async function updateTask(id: number, patch: Record<string, unknown>) {
    setTasks((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...patch } as BoardTask) : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if ("status" in patch) await loadProjects(); // refresh progress
  }

  async function moveTask(task: Task, dir: -1 | 1) {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[idx + dir];
    if (!next || movingId === task.id) return;
    setMovingId(task.id);
    setTasks((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, status: next } : t))
    );
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (activeId != null) await loadTasks(activeId);
    } finally {
      setMovingId(null);
    }
  }

  const tasksByStatus = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, [] as BoardTask[]])
    ) as Record<TaskStatus, BoardTask[]>;
    for (const t of tasks) {
      if (q && !t.title.toLowerCase().includes(q)) continue;
      (map[t.status] ?? map.backlog).push(t);
    }
    return map;
  }, [tasks, query]);

  const listTasks = useMemo(
    () => STATUS_ORDER.flatMap((s) => tasksByStatus[s]),
    [tasksByStatus]
  );

  // Previously-used labels in this project, offered as suggestions in the modal.
  const labelSuggestions = useMemo(
    () =>
      [...new Set(tasks.flatMap((t) => t.labels ?? []))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tasks]
  );

  const modalOpen = editing !== null || creatingStatus !== null;

  const emptyState = (
    <div className="empty-hero task-empty">
      <div className="empty-box">
        <span className="empty-cubes task-empty-ill">
          {view === "board" ? (
            <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="28" y="32" width="24" height="60" rx="4" />
              <rect x="58" y="32" width="24" height="60" rx="4" />
              <rect x="88" y="32" width="24" height="60" rx="4" />
              <rect x="32" y="62" width="16" height="9" rx="2.5" />
              <rect x="92" y="38" width="16" height="9" rx="2.5" />
              <rect
                className="board-card-move"
                x="32"
                y="38"
                width="16"
                height="9"
                rx="2.5"
                fill="currentColor"
                fillOpacity="0.14"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M40 28h-6a6 6 0 0 0-6 6v60a6 6 0 0 0 6 6h52a6 6 0 0 0 6-6V34a6 6 0 0 0-6-6h-6" />
              <rect x="44" y="20" width="32" height="16" rx="4" />
              <path className="cubes-grid" d="M40 52l3 3 5-6M56 53h22M40 68l3 3 5-6M56 69h22M40 84l3 3 5-6M56 85h16" />
            </svg>
          )}
        </span>
        <h2>No tasks yet</h2>
        <p>
          Tasks are the individual pieces of work in a project. Add your first
          task to start tracking progress here.
        </p>
        <div className="empty-actions">
          <button
            className="empty-create-btn"
            onClick={() => setCreatingStatus("backlog")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Item
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
  );

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  if (!activeProject) {
    return (
      <>
        <EmptyProjects onCreate={createProject} />
        {createOpen && (
          <CreateProjectModal
            onClose={() => setCreateOpen(false)}
            onCreated={onProjectCreated}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="board-view">
      <div className="proj-sticky">
      <div className="main-header">
        <div className="board-title">
          <div className="proj-head-row">
            <div className="proj-switcher-btn">
              <span className="proj-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
                </svg>
              </span>
              <h1>{activeProject.name}</h1>
            </div>

            <span className="proj-status-view">
              <StatusIcon status={activeProject.status} size={18} />
              {PROJECT_STATUS_LABELS[activeProject.status]}
              <span className="proj-progress-pct">{activeProject.progress}%</span>
            </span>
          </div>
          {activeProject.description && <p>{activeProject.description}</p>}
        </div>

        <div className="header-actions">
          <button type="button" className="pv-tool-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 3v16a2 2 0 0 0 2 2h16" />
              <path d="m7 14 4-4 3 3 5-5" />
            </svg>
            Insights
          </button>
          <button
            type="button"
            className="pv-tool-btn"
            onClick={() => router.push(`/project/${activeProject.id}/details`)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Configuration
          </button>
        </div>
      </div>

      <ProjectTabs
        projectId={activeProject.id}
        active={view === "list" ? "list" : "board"}
      />

      <div className="proj-toolbar">
        <div className="proj-toolbar-left">
          <button
            type="button"
            className="pv-tool-btn"
            onClick={() => setCreatingStatus("backlog")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Item
          </button>
          <div className="proj-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button type="button" className="proj-tool-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7h18M3 12h12M3 17h6" />
            </svg>
            Group By
          </button>
          <button type="button" className="proj-tool-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 5h18l-7 8v6l-4 2v-8z" />
            </svg>
            Filter
          </button>
          <button type="button" className="proj-tool-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h12M3 12h9M3 18h6M17 6v12M17 18l3-3M17 18l-3-3" />
            </svg>
            Sort
          </button>
        </div>
        <button type="button" className="pv-tool-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 4H14M10 4H3M21 12H12M8 12H3M21 20H16M12 20H3M14 2v4M8 10v4M16 18v4" />
          </svg>
          View
        </button>
      </div>
      </div>

      {tasks.length === 0 ? (
        emptyState
      ) : view === "board" ? (
        <div className="board">
          {STATUS_ORDER.map((status) => (
            <section className="column" key={status}>
              <div className="column-header">
                <span className="dot" style={{ background: STATUS_COLORS[status] }} />
                <h3>{STATUS_LABELS[status]}</h3>
                <span className="count">{tasksByStatus[status].length}</span>
              </div>

              {tasksByStatus[status].map((task) => {
                const idx = STATUS_ORDER.indexOf(task.status);
                const overdue =
                  task.due_date &&
                  task.status !== "done" &&
                  task.due_date < todayISO();
                return (
                  <article
                    key={task.id}
                    className="card"
                    onClick={() => router.push(`/task/${task.id}`)}
                  >
                    <div className="card-title">{task.title}</div>
                    <div className="card-meta">
                      <span
                        className="badge"
                        style={{
                          color: PRIO_COLOR[task.priority],
                          borderColor: PRIO_COLOR[task.priority],
                        }}
                      >
                        {task.priority}
                      </span>
                      {task.due_date && (
                        <span className={`due ${overdue ? "overdue" : ""}`}>
                          📅 {task.due_date}
                        </span>
                      )}
                      {!!task.subtask_total && (
                        <span className="sub-badge">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 12l4 4 10-10" />
                          </svg>
                          {task.subtask_done}/{task.subtask_total}
                        </span>
                      )}
                    </div>
                    <div className="card-move" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={idx === 0 || movingId === task.id}
                        onClick={() => moveTask(task, -1)}
                      >
                        ← Move
                      </button>
                      <button
                        disabled={idx === STATUS_ORDER.length - 1 || movingId === task.id}
                        onClick={() => moveTask(task, 1)}
                      >
                        Move →
                      </button>
                    </div>
                  </article>
                );
              })}

              <button className="add-task" onClick={() => setCreatingStatus(status)}>
                + Add task
              </button>
            </section>
          ))}
        </div>
      ) : (
        <div className="task-list">
          {selectedTasks.size > 0 && (
            <div className="pv-selbar">
              <span className="pv-selcount">{selectedTasks.size}</span>
              {selectedTasks.size === 1 && (
                <button
                  type="button"
                  className="pv-selact"
                  onClick={() => {
                    const id = [...selectedTasks][0];
                    const t = tasks.find((x) => x.id === id);
                    if (t) setEditing(t);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Edit
                </button>
              )}
              <button
                type="button"
                className="pv-selact danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${selectedTasks.size} task(s)? This cannot be undone.`
                    )
                  )
                    deleteSelectedTasks();
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
                Delete
              </button>
            </div>
          )}
          <div className="tl-head">
            <span />
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Assignee</span>
            <span>Labels</span>
            <span>Start Date</span>
            <span>End Date</span>
            <span />
          </div>
          {listTasks.map((task) => (
            <div
              key={task.id}
              className={`tl-row${dragOverTaskId === task.id ? " dragover" : ""}${
                dragTaskId === task.id ? " dragging" : ""
              }${selectedTasks.has(task.id) ? " selected" : ""}`}
              draggable
              onDragStart={() => setDragTaskId(task.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverTaskId !== task.id) setDragOverTaskId(task.id);
              }}
              onDrop={() => dropTask(task.id)}
              onDragEnd={() => {
                setDragTaskId(null);
                setDragOverTaskId(null);
              }}
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
                  checked={selectedTasks.has(task.id)}
                  onChange={() => toggleSelectTask(task.id)}
                  aria-label={`Select ${task.title}`}
                />
              </span>
              <span
                className="tl-title tl-title-link"
                onClick={() => router.push(`/task/${task.id}`)}
              >
                <TaskTypeIcon type={task.type} size={15} />
                <span className="tl-title-text">{task.title}</span>
              </span>
              <span className="tl-cell">
                <SelectField
                  inline
                  value={task.status}
                  options={STATUS_OPTS}
                  onChange={(v) => updateTask(task.id, { status: v })}
                />
              </span>
              <span className="tl-cell">
                <SelectField
                  inline
                  value={task.priority}
                  options={PRIORITY_OPTS}
                  onChange={(v) => updateTask(task.id, { priority: v })}
                />
              </span>
              <span className="tl-cell">
                <MemberPicker
                  inline
                  multiple
                  members={members}
                  value={task.assignees ?? []}
                  onChange={(ids) => updateTask(task.id, { assignees: ids })}
                  placeholder="Assign"
                />
              </span>
              <span className="tl-cell tl-labels-cell">
                <LabelsField
                  value={task.labels ?? []}
                  suggestions={labelSuggestions}
                  onChange={(labels) => updateTask(task.id, { labels })}
                />
              </span>
              <span className="tl-cell">
                <DatePicker
                  inline
                  quick
                  value={task.start_date ?? ""}
                  max={task.due_date || undefined}
                  onChange={(v) => updateTask(task.id, { start_date: v || null })}
                />
              </span>
              <span className="tl-cell">
                <DatePicker
                  inline
                  quick
                  value={task.due_date ?? ""}
                  min={task.start_date || undefined}
                  onChange={(v) => updateTask(task.id, { due_date: v || null })}
                />
              </span>

              <button
                className={`pv-kebab${taskMenuId === task.id ? " open" : ""}`}
                aria-label="Row actions"
                onClick={() =>
                  setTaskMenuId(taskMenuId === task.id ? null : task.id)
                }
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {taskMenuId === task.id && (
                <>
                  <div
                    className="pv-menu-backdrop"
                    onClick={() => setTaskMenuId(null)}
                  />
                  <div className="pv-menu">
                    <button
                      className="pv-menu-item"
                      onClick={() => {
                        setTaskMenuId(null);
                        setEditing(task);
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
                        setTaskMenuId(null);
                        if (
                          window.confirm(`Delete "${task.title}"? This cannot be undone.`)
                        )
                          deleteTaskById(task.id);
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
          ))}
          {listTasks.length === 0 && (
            <div className="tl-empty">No tasks match your search.</div>
          )}
          <button
            className="add-task tl-add"
            onClick={() => setCreatingStatus("backlog")}
          >
            + Add task
          </button>
        </div>
      )}
      </div>

      {modalOpen && (
        <TaskModal
          task={editing}
          defaultStatus={creatingStatus ?? "backlog"}
          members={members}
          labelSuggestions={labelSuggestions}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => {
            setEditing(null);
            setCreatingStatus(null);
          }}
        />
      )}

      {createOpen && (
        <CreateProjectModal
          onClose={() => setCreateOpen(false)}
          onCreated={onProjectCreated}
        />
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading"><Spinner /></div>}>
      <BoardPage />
    </Suspense>
  );
}
