"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Task,
  TaskStatus,
  TaskPriority,
  Sprint,
  CustomFieldWithValue,
} from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";
import Spinner from "@/components/Spinner";
import DatePicker from "@/components/app/DatePicker";

type Detail = Task & {
  project_name: string;
  subtasks: Task[];
  custom_fields: CustomFieldWithValue[];
};

const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
const PRIO_COLOR: Record<string, string> = {
  low: "var(--prio-low)",
  medium: "var(--prio-medium)",
  high: "var(--prio-high)",
};

export default function TaskDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [fieldVals, setFieldVals] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Local edit buffers for free-text fields.
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const data: Detail = await res.json();
    setDetail(data);
    setTitle(data.title);
    setDesc(data.description);
    setFieldVals(
      Object.fromEntries((data.custom_fields ?? []).map((f) => [f.id, f.value]))
    );
  }, [id]);

  async function saveFieldValue(fieldId: number, value: string) {
    setFieldVals((v) => ({ ...v, [fieldId]: value }));
    await fetch("/api/custom-fields/value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: id, field_id: fieldId, value }),
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Load the project's sprints once we know which project the task is in.
  useEffect(() => {
    if (!detail?.project_id) return;
    fetch(`/api/sprints?project_id=${detail.project_id}`)
      .then((r) => r.json())
      .then((d: Sprint[]) => setSprints(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [detail?.project_id]);

  // Patch the main task and merge the result back.
  async function patch(fields: Partial<Task>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const updated: Task = await res.json();
      setDetail((d) => (d ? { ...d, ...updated } : d));
    }
  }

  async function addSubtask(e: React.FormEvent) {
    e.preventDefault();
    const t = newSub.trim();
    if (!t || !detail || addingSub) return;
    setAddingSub(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: detail.project_id,
        parent_id: detail.id,
        title: t,
      }),
    });
    setAddingSub(false);
    if (res.ok) {
      const created: Task = await res.json();
      setDetail((d) => (d ? { ...d, subtasks: [...d.subtasks, created] } : d));
      setNewSub("");
    }
  }

  async function toggleSub(sub: Task) {
    const next: TaskStatus = sub.status === "done" ? "todo" : "done";
    setDetail((d) =>
      d
        ? {
            ...d,
            subtasks: d.subtasks.map((s) =>
              s.id === sub.id ? { ...s, status: next } : s
            ),
          }
        : d
    );
    await fetch(`/api/tasks/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  async function deleteSub(sub: Task) {
    setDetail((d) =>
      d ? { ...d, subtasks: d.subtasks.filter((s) => s.id !== sub.id) } : d
    );
    await fetch(`/api/tasks/${sub.id}`, { method: "DELETE" });
  }

  async function deleteTask() {
    if (!detail) return;
    if (!window.confirm(`Delete "${detail.title}" and its subtasks?`)) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    router.push(`/?project=${detail.project_id}`);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="empty-state">
        <div className="empty-card">
          <h2>Task not found</h2>
          <p>This task may have been deleted.</p>
          <div className="empty-card-actions">
            <Link className="btn btn-primary" href="/">
              Back to board
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const subDone = detail.subtasks.filter((s) => s.status === "done").length;

  return (
    <div className="task-detail">
      <nav className="crumbs">
        <Link href={`/?project=${detail.project_id}`}>{detail.project_name}</Link>
        <span className="sep">/</span>
        <span className="cur">Task #{detail.id}</span>
      </nav>

      <input
        className="td-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const v = title.trim();
          if (v && v !== detail.title) patch({ title: v });
          else setTitle(detail.title);
        }}
        placeholder="Task title"
      />

      <div className="td-grid">
        <div className="td-main">
          <label className="td-label">Description</label>
          <textarea
            className="td-desc"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => {
              if (desc !== detail.description) patch({ description: desc });
            }}
            placeholder="Add a description…"
            rows={5}
          />

          {detail.custom_fields.length > 0 && (
            <div className="td-fields">
              {detail.custom_fields.map((f) => (
                <div className="td-field-row" key={f.id}>
                  <span className="td-field-name">{f.name}</span>
                  {f.type === "select" ? (
                    <select
                      className="td-field-input"
                      value={fieldVals[f.id] ?? ""}
                      onChange={(e) => saveFieldValue(f.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "date" ? (
                    <div className="td-field-input-wrap">
                      <DatePicker
                        value={fieldVals[f.id] ?? ""}
                        onChange={(v) => saveFieldValue(f.id, v)}
                        placeholder="Select date"
                      />
                    </div>
                  ) : (
                    <input
                      className="td-field-input"
                      type={f.type === "number" ? "number" : "text"}
                      value={fieldVals[f.id] ?? ""}
                      onChange={(e) =>
                        setFieldVals((v) => ({ ...v, [f.id]: e.target.value }))
                      }
                      onBlur={(e) => saveFieldValue(f.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="td-subhead">
            <h3>Subtasks</h3>
            {detail.subtasks.length > 0 && (
              <span className="td-subcount">
                {subDone}/{detail.subtasks.length} done
              </span>
            )}
          </div>

          <ul className="subtask-list">
            {detail.subtasks.map((s) => (
              <li key={s.id} className={`subtask ${s.status === "done" ? "done" : ""}`}>
                <button
                  className="sub-check"
                  onClick={() => toggleSub(s)}
                  aria-label={s.status === "done" ? "Mark not done" : "Mark done"}
                >
                  {s.status === "done" && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  )}
                </button>
                <Link href={`/task/${s.id}`} className="sub-title">
                  {s.title}
                </Link>
                <span
                  className="badge"
                  style={{ color: PRIO_COLOR[s.priority], borderColor: PRIO_COLOR[s.priority] }}
                >
                  {s.priority}
                </span>
                <button className="sub-del" onClick={() => deleteSub(s)} aria-label="Delete subtask">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          <form className="subtask-add" onSubmit={addSubtask}>
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              placeholder="Add a subtask…"
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={addingSub || !newSub.trim()}>
              {addingSub ? <Spinner /> : "Add"}
            </button>
          </form>
        </div>

        <aside className="td-side">
          <label className="td-label">Status</label>
          <div className="td-status">
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                className={`status-pill ${detail.status === s ? "active" : ""}`}
                onClick={() => patch({ status: s })}
              >
                <span className="dot" style={{ background: `var(--${s})` }} />
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <label className="td-label">Priority</label>
          <select
            className="td-select"
            value={detail.priority}
            onChange={(e) => patch({ priority: e.target.value as TaskPriority })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>

          <label className="td-label">Due date</label>
          <DatePicker
            value={detail.due_date ?? ""}
            onChange={(v) => patch({ due_date: v || null })}
            placeholder="No due date"
          />

          {sprints.length > 0 && (
            <>
              <label className="td-label">Sprint</label>
              <select
                className="td-select"
                value={detail.sprint_id ?? ""}
                onChange={(e) =>
                  patch({ sprint_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Backlog (no sprint)</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <button className="btn btn-danger btn-sm td-delete" onClick={deleteTask}>
            Delete task
          </button>
        </aside>
      </div>
    </div>
  );
}
