"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Member,
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  Sprint,
  CustomFieldWithValue,
} from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TASK_TYPE_LABELS,
  TASK_TYPE_ORDER,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import DatePicker from "@/components/app/DatePicker";
import RichTextEditor from "@/components/app/RichTextEditor";
import SelectField, { type SelectOption } from "@/components/app/SelectField";
import MemberPicker from "@/components/app/MemberPicker";
import LabelsField from "@/components/app/LabelsField";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";

type Detail = Task & {
  project_name: string;
  assignees?: string[];
  subtasks: Task[];
  custom_fields: CustomFieldWithValue[];
};

const PRIO_COLOR: Record<string, string> = {
  critical: "var(--prio-critical)",
  high: "var(--prio-high)",
  medium: "var(--prio-medium)",
  low: "var(--prio-low)",
};

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
const TYPE_OPTS: SelectOption[] = TASK_TYPE_ORDER.map((t) => ({
  value: t,
  label: TASK_TYPE_LABELS[t],
  icon: <TaskTypeIcon type={t} size={15} />,
}));

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function TaskDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [fieldVals, setFieldVals] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Local edit buffers for free-text fields.
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  // Collapsible left-column sections.
  const [openSub, setOpenSub] = useState(true);
  const [openAtt, setOpenAtt] = useState(true);
  // Description is collapsible + click-to-edit (editor + Save while editing).
  const [openDesc, setOpenDesc] = useState(true);
  const [editingDesc, setEditingDesc] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);

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

  // Load the project's sprints + members once we know which project we're in.
  useEffect(() => {
    if (!detail?.project_id) return;
    fetch(`/api/sprints?project_id=${detail.project_id}`)
      .then((r) => r.json())
      .then((d: Sprint[]) => setSprints(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetch(`/api/members?project_id=${detail.project_id}`)
      .then((r) => r.json())
      .then((d: { members?: Member[] }) =>
        setMembers(Array.isArray(d.members) ? d.members : [])
      )
      .catch(() => {});
  }, [detail?.project_id]);

  // Feed the topbar breadcrumb: Project Name › Task Name.
  useEffect(() => {
    if (!detail) return;
    window.dispatchEvent(
      new CustomEvent("tb:task-crumb", {
        detail: {
          project: detail.project_name,
          projectId: detail.project_id,
          task: detail.title,
        },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent("tb:task-crumb", { detail: null }));
    };
  }, [detail?.project_name, detail?.project_id, detail?.title]);

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
    const next: TaskStatus = sub.status === "done" ? "backlog" : "done";
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
          <h2>Task Not Found</h2>
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
  // Progress = completed subtasks; a Done task counts as 100%.
  const progress =
    detail.status === "done"
      ? 100
      : detail.subtasks.length
      ? Math.round((subDone / detail.subtasks.length) * 100)
      : 0;

  return (
    <div className="task-detail">
      <div className="td-grid">
        <div className="td-main">
          <input
            className="td-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            onBlur={() => {
              const v = title.trim();
              if (v && v !== detail.title) patch({ title: v });
              else setTitle(detail.title);
            }}
            placeholder="Enter your item title"
          />
          <div className="td-section-head">
            <button
              type="button"
              className="td-section-toggle"
              onClick={() => setOpenDesc((o) => !o)}
            >
              <svg className={`td-caret${openDesc ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
              Description
            </button>
          </div>
          {openDesc &&
            (editingDesc ? (
            <>
              <RichTextEditor
                value={desc}
                onChange={setDesc}
                placeholder="Add a description…"
                toolbarBottom
              />
              <div className="td-desc-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setDesc(detail.description);
                    setEditingDesc(false);
                  }}
                  disabled={savingDesc}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={savingDesc}
                  onClick={async () => {
                    setSavingDesc(true);
                    if (desc !== detail.description)
                      await patch({ description: desc });
                    setSavingDesc(false);
                    setEditingDesc(false);
                  }}
                >
                  {savingDesc ? <Spinner /> : "Save"}
                </button>
              </div>
            </>
          ) : (
            <div
              className="td-desc-view"
              role="button"
              tabIndex={0}
              onClick={() => {
                setDesc(detail.description);
                setEditingDesc(true);
              }}
            >
              {detail.description &&
              detail.description.replace(/<[^>]*>/g, "").trim() ? (
                <div
                  className="td-desc-content"
                  dangerouslySetInnerHTML={{ __html: detail.description }}
                />
              ) : (
                <span className="td-desc-placeholder">Click here to add description</span>
              )}
            </div>
            ))}

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

          <div className="td-section-head">
            <button
              type="button"
              className="td-section-toggle"
              onClick={() => setOpenSub((o) => !o)}
            >
              <svg className={`td-caret${openSub ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
              Sub Task
              <span className="td-section-count">{detail.subtasks.length}</span>
            </button>
            {detail.subtasks.length > 0 && (
              <span className="td-subcount">{subDone}/{detail.subtasks.length} done</span>
            )}
          </div>

          {openSub && (
          <>
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
          </>
          )}

          <div className="td-section-head">
            <button
              type="button"
              className="td-section-toggle"
              onClick={() => setOpenAtt((o) => !o)}
            >
              <svg className={`td-caret${openAtt ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
              Attachments
              <span className="td-section-count">0</span>
            </button>
          </div>
          {openAtt && (
            <div className="td-att-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span>Attachments — coming soon</span>
            </div>
          )}
        </div>

        <aside className="td-side">
          <div className="td-prop-progress">
            <span className="td-prop-section">Progress</span>
            <div className="td-progress">
              <div className="td-progress-track">
                <div
                  className="td-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="td-progress-pct">{progress}%</span>
            </div>
          </div>

          <span className="td-prop-section">Properties</span>
          <div className="td-props">
            <div className="td-prop">
              <span className="td-prop-k">Item Type</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={detail.type}
                  options={TYPE_OPTS}
                  onChange={(v) => patch({ type: v as TaskType })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Start Date</span>
              <span className="td-prop-v">
                <DatePicker
                  inline
                  quick
                  value={detail.start_date ?? ""}
                  max={detail.due_date || undefined}
                  onChange={(v) => patch({ start_date: v || null })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Due Date</span>
              <span className="td-prop-v">
                <DatePicker
                  inline
                  quick
                  value={detail.due_date ?? ""}
                  min={detail.start_date || undefined}
                  onChange={(v) => patch({ due_date: v || null })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Priority</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={detail.priority}
                  options={PRIORITY_OPTS}
                  onChange={(v) => patch({ priority: v as TaskPriority })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Status</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={detail.status}
                  options={STATUS_OPTS}
                  onChange={(v) => patch({ status: v as TaskStatus })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Assigned to</span>
              <span className="td-prop-v">
                <MemberPicker
                  inline
                  multiple
                  members={members}
                  value={detail.assignees ?? []}
                  onChange={(ids) => patch({ assignees: ids } as Partial<Task>)}
                  placeholder="Assign"
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Story Point</span>
              <span className="td-prop-v">
                <input
                  className="td-prop-input"
                  type="number"
                  min={0}
                  defaultValue={detail.story_points ?? ""}
                  placeholder="—"
                  onBlur={(e) =>
                    patch({
                      story_points: e.target.value
                        ? Math.max(0, Math.round(Number(e.target.value)))
                        : null,
                    })
                  }
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Label</span>
              <span className="td-prop-v">
                <LabelsField
                  value={detail.labels ?? []}
                  onChange={(labels) => patch({ labels })}
                />
              </span>
            </div>
            {sprints.length > 0 && (
              <div className="td-prop">
                <span className="td-prop-k">Sprint</span>
                <span className="td-prop-v">
                  <SelectField
                    inline
                    value={String(detail.sprint_id ?? "")}
                    options={[
                      { value: "", label: "Backlog" },
                      ...sprints.map((s) => ({
                        value: String(s.id),
                        label: s.name,
                      })),
                    ]}
                    onChange={(v) =>
                      patch({ sprint_id: v ? Number(v) : null } as Partial<Task>)
                    }
                  />
                </span>
              </div>
            )}
            <div className="td-prop">
              <span className="td-prop-k">Created</span>
              <span className="td-prop-v td-prop-ro">
                {fmtDate(detail.created_at)}
              </span>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
