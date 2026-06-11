"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskModal, { type TaskDraft } from "@/app/TaskModal";
import ProjectTabs from "@/components/app/ProjectTabs";
import EmptyProjects from "@/components/app/EmptyProjects";
import CreateProjectModal from "@/components/app/CreateProjectModal";

type ProjectWithCount = Project & { task_count: number };
type BoardTask = Task & { subtask_total?: number; subtask_done?: number };

const PRIO_COLOR: Record<string, string> = {
  low: "var(--prio-low)",
  medium: "var(--prio-medium)",
  high: "var(--prio-high)",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function BoardPage() {
  const params = useSearchParams();
  const router = useRouter();
  const urlProject = params.get("project");

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [createOpen, setCreateOpen] = useState(false);

  const [editing, setEditing] = useState<Task | null>(null);
  const [creatingStatus, setCreatingStatus] = useState<TaskStatus | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);

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

  // ---- Project actions ----
  const createProject = () => setCreateOpen(true);

  function onProjectCreated(p: Project) {
    setCreateOpen(false);
    // Optimistically show the new (empty) project's board right away — no
    // spinner, no empty-state flash. Reconcile the list in the background.
    setProjects((cur) =>
      cur.some((x) => x.id === p.id) ? cur : [{ ...p, task_count: 0 }, ...cur]
    );
    setActiveId(p.id);
    void loadProjects();
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
    const map: Record<TaskStatus, BoardTask[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const modalOpen = editing !== null || creatingStatus !== null;

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
      <div className="main-header">
        <div className="board-title">
          {/* Project switcher */}
          <div className="proj-switcher">
            <button
              className="proj-switcher-btn"
              onClick={() => setSwitcherOpen((o) => !o)}
            >
              <h1>{activeProject.name}</h1>
              <svg className={`dd-chevron${switcherOpen ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {switcherOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setSwitcherOpen(false)} />
                <div className="menu proj-menu">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      className={`proj-menu-item ${p.id === activeId ? "active" : ""}`}
                      onClick={() => {
                        setActiveId(p.id);
                        setSwitcherOpen(false);
                      }}
                    >
                      <span className="name">{p.name}</span>
                      <span className="count">{p.task_count}</span>
                    </button>
                  ))}
                  <button
                    className="proj-menu-new"
                    onClick={() => {
                      setSwitcherOpen(false);
                      createProject();
                    }}
                  >
                    + New project
                  </button>
                </div>
              </>
            )}
          </div>
          {activeProject.description && <p>{activeProject.description}</p>}
        </div>

        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={view === "board" ? "active" : ""}
              onClick={() => setView("board")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="5" height="16" rx="1" />
                <rect x="10" y="4" width="5" height="11" rx="1" />
                <rect x="17" y="4" width="4" height="7" rx="1" />
              </svg>
              Board
            </button>
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
              List
            </button>
          </div>
          <button className="btn btn-sm" onClick={renameProject} disabled={deletingProject}>
            Edit
          </button>
          <button
            className="btn btn-sm btn-danger"
            onClick={deleteProject}
            disabled={deletingProject}
          >
            {deletingProject ? (
              <>
                Deleting
                <Spinner />
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>

      <ProjectTabs projectId={activeProject.id} active="board" />

      {view === "board" ? (
        <div className="board">
          {STATUS_ORDER.map((status) => (
            <section className="column" key={status}>
              <div className="column-header">
                <span className="dot" style={{ background: `var(--${status})` }} />
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
          <div className="tl-head">
            <span>Title</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Due</span>
            <span>Subtasks</span>
          </div>
          {STATUS_ORDER.flatMap((s) => tasksByStatus[s]).map((task) => {
            const overdue =
              task.due_date &&
              task.status !== "done" &&
              task.due_date < todayISO();
            return (
              <button
                key={task.id}
                className="tl-row"
                onClick={() => router.push(`/task/${task.id}`)}
              >
                <span className="tl-title">{task.title}</span>
                <span className="tl-status">
                  <span className="dot" style={{ background: `var(--${task.status})` }} />
                  {STATUS_LABELS[task.status]}
                </span>
                <span
                  className="badge"
                  style={{
                    color: PRIO_COLOR[task.priority],
                    borderColor: PRIO_COLOR[task.priority],
                  }}
                >
                  {task.priority}
                </span>
                <span className={`tl-due ${overdue ? "overdue" : ""}`}>
                  {task.due_date || "—"}
                </span>
                <span className="tl-sub">
                  {task.subtask_total ? `${task.subtask_done}/${task.subtask_total}` : "—"}
                </span>
              </button>
            );
          })}
          {tasks.length === 0 && (
            <div className="tl-empty">No tasks yet.</div>
          )}
          <button
            className="add-task tl-add"
            onClick={() => setCreatingStatus("todo")}
          >
            + Add task
          </button>
        </div>
      )}
      </div>

      {modalOpen && (
        <TaskModal
          task={editing}
          defaultStatus={creatingStatus ?? "todo"}
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
