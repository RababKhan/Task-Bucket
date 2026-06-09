"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";
import { WORKSPACE_DOMAIN } from "@/lib/subdomain";
import ThemeToggle from "@/components/ThemeToggle";
import Spinner from "@/components/Spinner";
import TaskModal, { type TaskDraft } from "./TaskModal";

type ProjectWithCount = Project & { task_count: number };

const PRIO_COLOR: Record<string, string> = {
  low: "var(--prio-low)",
  medium: "var(--prio-medium)",
  high: "var(--prio-high)",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const { data: session } = useSession();
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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
    setActiveId((cur) =>
      cur && data.some((p) => p.id === cur) ? cur : data[0]?.id ?? null
    );
    return data;
  }, []);

  const loadTasks = useCallback(async (projectId: number) => {
    const res = await fetch(`/api/tasks?project_id=${projectId}`);
    setTasks(await res.json());
  }, []);

  useEffect(() => {
    loadProjects().finally(() => setLoading(false));
  }, [loadProjects]);

  useEffect(() => {
    if (activeId != null) loadTasks(activeId);
    else setTasks([]);
  }, [activeId, loadTasks]);

  // ---- Project actions ----
  async function createProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const description = window.prompt("Description (optional)") ?? "";
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const created: Project = await res.json();
    await loadProjects();
    setActiveId(created.id);
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
    await loadProjects(); // refresh sidebar counts
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
    // optimistic update
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
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const t of tasks) map[t.status].push(t);
    return map;
  }, [tasks]);

  const modalOpen = editing !== null || creatingStatus !== null;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-main">
            {session?.workspace ? (
              <>
                <div className="ws-name">{session.workspace.name}</div>
                <div className="ws-domain">
                  {session.workspace.subdomain}.{WORKSPACE_DOMAIN}
                </div>
              </>
            ) : (
              <div className="brand">
                Task <span>Bucket</span>
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
        <div className="sidebar-section">
          <h2>Projects</h2>
          <button
            className="btn btn-sm btn-primary"
            onClick={createProject}
            title="New project"
          >
            + New
          </button>
        </div>
        <ul className="project-list">
          {projects.map((p) => (
            <li
              key={p.id}
              className={`project-item ${p.id === activeId ? "active" : ""}`}
            >
              <button className="name" onClick={() => setActiveId(p.id)}>
                {p.name}
              </button>
              <span className="count">{p.task_count}</span>
            </li>
          ))}
          {!loading && projects.length === 0 && (
            <li style={{ color: "var(--text-dim)", padding: "8px 10px" }}>
              No projects yet.
            </li>
          )}
        </ul>

        {session?.user && (
          <div className="user-chip">
            <div className="avatar">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.user.image} alt="" />
              ) : (
                (session.user.name || session.user.email || "?")
                  .charAt(0)
                  .toUpperCase()
              )}
            </div>
            <div className="info">
              <div className="nm">{session.user.name || "Account"}</div>
              <div className="em">{session.user.email}</div>
            </div>
            <button
              className="btn btn-sm"
              title="Sign out"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              ⎋
            </button>
          </div>
        )}
      </aside>

      <main className="main">
        {activeProject ? (
          <>
            <div className="main-header">
              <div>
                <h1>{activeProject.name}</h1>
                {activeProject.description && (
                  <p>{activeProject.description}</p>
                )}
              </div>
              <div className="header-actions">
                <button
                  className="btn btn-sm"
                  onClick={renameProject}
                  disabled={deletingProject}
                >
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

            <div className="board">
              {STATUS_ORDER.map((status) => (
                <section className="column" key={status}>
                  <div className="column-header">
                    <span
                      className="dot"
                      style={{ background: `var(--${status})` }}
                    />
                    <h3>{STATUS_LABELS[status]}</h3>
                    <span className="count">
                      {tasksByStatus[status].length}
                    </span>
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
                        onClick={() => setEditing(task)}
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
                        </div>
                        <div
                          className="card-move"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            disabled={idx === 0 || movingId === task.id}
                            onClick={() => moveTask(task, -1)}
                          >
                            ← Move
                          </button>
                          <button
                            disabled={
                              idx === STATUS_ORDER.length - 1 ||
                              movingId === task.id
                            }
                            onClick={() => moveTask(task, 1)}
                          >
                            Move →
                          </button>
                        </div>
                      </article>
                    );
                  })}

                  <button
                    className="add-task"
                    onClick={() => setCreatingStatus(status)}
                  >
                    + Add task
                  </button>
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <h2>No project selected</h2>
            <p>Create a project from the sidebar to get started.</p>
            <button
              className="btn btn-primary"
              onClick={createProject}
              style={{ marginTop: 12 }}
            >
              + New project
            </button>
          </div>
        )}
      </main>

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
    </div>
  );
}
