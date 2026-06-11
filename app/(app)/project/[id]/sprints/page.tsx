"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Sprint, Task } from "@/lib/types";
import { SPRINT_STATUS_LABELS } from "@/lib/types";
import Spinner from "@/components/Spinner";

type SprintWithCount = Sprint & { task_count: number };

const PRIO_COLOR: Record<string, string> = {
  low: "var(--prio-low)",
  medium: "var(--prio-medium)",
  high: "var(--prio-high)",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function SprintsPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const router = useRouter();

  const [sprints, setSprints] = useState<SprintWithCount[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      fetch(`/api/sprints?project_id=${projectId}`).then((r) => r.json()),
      fetch(`/api/tasks?project_id=${projectId}`).then((r) => r.json()),
    ]);
    setSprints(Array.isArray(s) ? s : []);
    setTasks(Array.isArray(t) ? t : []);
  }, [projectId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const tasksBySprint = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of tasks) {
      if (t.sprint_id != null) {
        const arr = map.get(t.sprint_id) ?? [];
        arr.push(t);
        map.set(t.sprint_id, arr);
      }
    }
    return map;
  }, [tasks]);

  const backlog = useMemo(() => tasks.filter((t) => t.sprint_id == null), [tasks]);

  async function createSprint() {
    const name = window.prompt("Sprint name (e.g. Sprint 1)");
    if (!name?.trim()) return;
    const goal = window.prompt("Sprint goal (optional)") ?? "";
    await fetch("/api/sprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, name, goal }),
    });
    await load();
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
    if (!window.confirm(`Delete "${s.name}"? Its tasks return to the backlog.`)) return;
    await fetch(`/api/sprints/${s.id}`, { method: "DELETE" });
    await load();
  }

  async function setTaskSprint(taskId: number, sprintId: number | null) {
    setPickerFor(null);
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
      <div className="sprints-head">
        <p className="sprints-sub">
          Plan work into sprints. Start one when you&apos;re ready and complete
          it when the work is done.
        </p>
        <button className="btn btn-primary btn-sm" onClick={createSprint}>
          + New sprint
        </button>
      </div>

      {sprints.length === 0 && (
        <div className="empty-card" style={{ marginTop: 8 }}>
          <h2>No sprints yet</h2>
          <p>Create a sprint, then add tasks from the backlog below.</p>
          <div className="empty-card-actions">
            <button className="btn btn-primary" onClick={createSprint}>
              Create new sprint
            </button>
          </div>
        </div>
      )}

      {sprints.map((s) => {
        const items = tasksBySprint.get(s.id) ?? [];
        return (
          <section key={s.id} className="sprint-card">
            <div className="sprint-card-head">
              <div className="sprint-card-title">
                <h3>{s.name}</h3>
                <span className={`sprint-pill ${s.status}`}>
                  {SPRINT_STATUS_LABELS[s.status]}
                </span>
                <span className="sprint-count">{items.length} tasks</span>
              </div>
              <div className="sprint-actions">
                {s.status === "planned" && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() =>
                      patchSprint(s.id, { status: "active", start_date: today() })
                    }
                  >
                    Start sprint
                  </button>
                )}
                {s.status === "active" && (
                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      patchSprint(s.id, { status: "completed", end_date: today() })
                    }
                  >
                    Complete sprint
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => deleteSprint(s)}>
                  Delete
                </button>
              </div>
            </div>
            {s.goal && <p className="sprint-goal">{s.goal}</p>}

            <ul className="sprint-tasks">
              {items.map((t) => (
                <li key={t.id} className="sprint-task">
                  <button className="st-title" onClick={() => router.push(`/task/${t.id}`)}>
                    <span className="dot" style={{ background: `var(--${t.status})` }} />
                    {t.title}
                  </button>
                  <span
                    className="badge"
                    style={{ color: PRIO_COLOR[t.priority], borderColor: PRIO_COLOR[t.priority] }}
                  >
                    {t.priority}
                  </span>
                  <button className="st-remove" onClick={() => setTaskSprint(t.id, null)} title="Remove from sprint">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="sprint-empty">No tasks in this sprint.</li>}
            </ul>

            {pickerFor === s.id ? (
              <div className="sprint-picker">
                {backlog.length === 0 ? (
                  <span className="sprint-picker-empty">Backlog is empty.</span>
                ) : (
                  backlog.map((t) => (
                    <button key={t.id} className="sprint-picker-item" onClick={() => setTaskSprint(t.id, s.id)}>
                      + {t.title}
                    </button>
                  ))
                )}
                <button className="sprint-picker-close" onClick={() => setPickerFor(null)}>
                  Done
                </button>
              </div>
            ) : (
              <button className="add-task sprint-add" onClick={() => setPickerFor(s.id)}>
                + Add tasks from backlog
              </button>
            )}
          </section>
        );
      })}

      <section className="sprint-card backlog-card">
        <div className="sprint-card-head">
          <div className="sprint-card-title">
            <h3>Backlog</h3>
            <span className="sprint-count">{backlog.length} tasks</span>
          </div>
        </div>
        <ul className="sprint-tasks">
          {backlog.map((t) => (
            <li key={t.id} className="sprint-task">
              <button className="st-title" onClick={() => router.push(`/task/${t.id}`)}>
                <span className="dot" style={{ background: `var(--${t.status})` }} />
                {t.title}
              </button>
              <span
                className="badge"
                style={{ color: PRIO_COLOR[t.priority], borderColor: PRIO_COLOR[t.priority] }}
              >
                {t.priority}
              </span>
              {sprints.length > 0 && (
                <select
                  className="st-assign"
                  value=""
                  onChange={(e) => e.target.value && setTaskSprint(t.id, Number(e.target.value))}
                >
                  <option value="">Add to sprint…</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </li>
          ))}
          {backlog.length === 0 && <li className="sprint-empty">Backlog is empty.</li>}
        </ul>
      </section>
    </div>
  );
}
