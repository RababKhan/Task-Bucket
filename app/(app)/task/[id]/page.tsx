"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
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

type ActivityMeta = {
  field: "status" | "priority" | "type";
  from: string | null;
  to: string | null;
};

type ActivityItem = {
  id: number;
  text: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_image: string | null;
  meta?: ActivityMeta | null;
};

type Detail = Task & {
  project_name: string;
  assignees?: string[];
  subtasks: Task[];
  custom_fields: CustomFieldWithValue[];
  activity?: ActivityItem[];
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

// Description has content if there's text OR embedded media (image/table/etc.),
// so an image-only description isn't treated as empty.
function hasRichContent(html: string | null | undefined) {
  if (!html) return false;
  if (/<(img|table|hr|iframe|video)/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

// Persisted collapse state for the detail-page sections (per section key).
function readOpen(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  const v = window.localStorage.getItem(`td-open-${key}`);
  return v == null ? def : v === "1";
}
function writeOpen(key: string, open: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`td-open-${key}`, open ? "1" : "0");
  }
}

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

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Sprint icon (custom filled gear/cycle glyph).
function SprintIcon() {
  return (
    <svg className="td-sprint-ic" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M12.7235 7.93333L10.5301 6.66667L12.7235 5.4C13.0435 5.21333 13.1501 4.80667 12.9701 4.48667L11.6368 2.18C11.4501 1.86 11.0435 1.75333 10.7235 1.93333L8.53015 3.2V0.666667C8.53015 0.3 8.23015 0 7.86348 0H5.19681C4.83015 0 4.53015 0.3 4.53015 0.666667V3.2L2.33681 1.93333C2.01681 1.75333 1.61015 1.86 1.42348 2.18L0.0901479 4.48667C-0.0965188 4.80667 0.0168146 5.21333 0.336815 5.4L2.53015 6.66667L0.336815 7.93333C0.0168146 8.12 -0.0898521 8.52667 0.0901479 8.84667L1.42348 11.1533C1.61015 11.4733 2.01681 11.58 2.33681 11.4L4.53015 10.1333V12.6667C4.53015 13.0333 4.83015 13.3333 5.19681 13.3333H7.86348C8.23015 13.3333 8.53015 13.0333 8.53015 12.6667V10.1333L10.7235 11.4C11.0435 11.5867 11.4501 11.4733 11.6368 11.1533L12.9701 8.84667C13.1568 8.52667 13.0435 8.12 12.7235 7.93333ZM10.8168 9.91333L7.69682 8.11333C7.47682 7.98 7.19682 8.14 7.19682 8.4V12H5.86348V8.4C5.86348 8.14667 5.58348 7.98 5.36348 8.11333L2.24348 9.91333L1.57681 8.76L4.69681 6.96C4.91681 6.83333 4.91681 6.51333 4.69681 6.38L1.57681 4.58L2.24348 3.42667L5.36348 5.22667C5.58348 5.35333 5.86348 5.19333 5.86348 4.93333V1.33333H7.19682V4.93333C7.19682 5.18667 7.47682 5.35333 7.69682 5.22L10.8168 3.42L11.4835 4.57333L8.36348 6.37333C8.14348 6.5 8.14348 6.82 8.36348 6.95333L11.4835 8.75333L10.8168 9.91333Z" fill="currentColor" />
    </svg>
  );
}

// A status/priority value rendered as its icon + label, for inline use in the
// activity log (e.g. "changed status from [icon] Backlog to [icon] In Test").
function ActivityValue({
  field,
  value,
}: {
  field: "status" | "priority" | "type";
  value: string | null;
}) {
  if (!value) return <>none</>;
  return (
    <span className="td-activity-val">
      {field === "status" ? (
        <TaskStatusIcon status={value as TaskStatus} size={14} />
      ) : field === "priority" ? (
        <PriorityIcon priority={value as TaskPriority} size={13} />
      ) : (
        <TaskTypeIcon type={value as TaskType} size={14} />
      )}
      {field === "status"
        ? STATUS_LABELS[value as TaskStatus] ?? value
        : field === "priority"
        ? PRIORITY_LABELS[value as TaskPriority] ?? value
        : TASK_TYPE_LABELS[value as TaskType] ?? value}
    </span>
  );
}

// Render an activity string, turning **…** segments into bold (used for names).
function renderActivityText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
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
  // Live value while dragging the progress slider (null = not dragging).
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  // Story Point is click-to-edit so its resting state shows just an icon/value.
  const [editingSP, setEditingSP] = useState(false);
  // Activity section tabs.
  const [activityTab, setActivityTab] = useState<
    "activity" | "comments" | "time"
  >("activity");
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  // Collapsible left-column sections — persisted so they survive a refresh.
  const [openSub, setOpenSub] = useState(() => readOpen("sub", true));
  const [openAtt, setOpenAtt] = useState(() => readOpen("att", true));
  // Description is collapsible + click-to-edit (editor + Save while editing).
  const [openDesc, setOpenDesc] = useState(() => readOpen("desc", true));
  const [editingDesc, setEditingDesc] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);

  // Persist section collapse state across refreshes.
  useEffect(() => writeOpen("desc", openDesc), [openDesc]);
  useEffect(() => writeOpen("sub", openSub), [openSub]);
  useEffect(() => writeOpen("att", openAtt), [openAtt]);

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

  // Feed the topbar breadcrumb: Project Name › Item ID.
  useEffect(() => {
    if (!detail) return;
    const crumbId =
      detail.seq != null
        ? `${
            detail.project_name
              .replace(/[^a-zA-Z0-9]/g, "")
              .slice(0, 3)
              .toUpperCase() || "TSK"
          }-${String(detail.seq).padStart(3, "0")}`
        : detail.title;
    window.dispatchEvent(
      new CustomEvent("tb:task-crumb", {
        detail: {
          project: detail.project_name,
          projectId: detail.project_id,
          task: crumbId,
        },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent("tb:task-crumb", { detail: null }));
    };
  }, [detail?.project_name, detail?.project_id, detail?.title, detail?.seq]);

  // Patch the main task and merge the result back.
  async function patch(fields: Partial<Task>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      // Response includes the refreshed activity log so sidebar edits show up
      // in the Activity section immediately.
      const updated: Task & { activity?: ActivityItem[] } = await res.json();
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

  // Human item id, e.g. DEV-001 (3-char project prefix + zero-padded seq).
  const itemId =
    detail.seq != null
      ? `${
          detail.project_name
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 3)
            .toUpperCase() || "TSK"
        }-${String(detail.seq).padStart(3, "0")}`
      : null;

  const subDone = detail.subtasks.filter((s) => s.status === "done").length;
  // Derived progress = completed subtasks; a Done task counts as 100%.
  const derivedProgress =
    detail.status === "done"
      ? 100
      : detail.subtasks.length
      ? Math.round((subDone / detail.subtasks.length) * 100)
      : 0;
  // A manually-set value (detail.progress) overrides the derived one; while the
  // slider is being dragged, show the live drag value.
  const progress =
    dragProgress != null
      ? dragProgress
      : detail.progress != null
      ? detail.progress
      : derivedProgress;

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
          <div className="td-main-scroll">
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
            <div className="td-desc-edit">
              <RichTextEditor
                value={desc}
                onChange={setDesc}
                placeholder="Add a description…"
                toolbarBottom
                autoFocus
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
            </div>
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
              {hasRichContent(detail.description) ? (
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

          <div className="td-activity">
            <div className="td-tabs">
              <button
                type="button"
                className={`td-tab${activityTab === "activity" ? " active" : ""}`}
                onClick={() => setActivityTab("activity")}
              >
                Activity
              </button>
              <button
                type="button"
                className={`td-tab${activityTab === "comments" ? " active" : ""}`}
                onClick={() => setActivityTab("comments")}
              >
                Comments
              </button>
              <button
                type="button"
                className={`td-tab${activityTab === "time" ? " active" : ""}`}
                onClick={() => setActivityTab("time")}
              >
                Time Entry
              </button>
            </div>
            <div className="td-tab-panel">
              {activityTab === "activity" &&
                (detail.activity && detail.activity.length ? (
                  <ul className="td-activity-list">
                    {detail.activity.map((a) => (
                      <li key={a.id} className="td-activity-item">
                        <span className="td-activity-avatar">
                          {a.actor_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.actor_image} alt="" />
                          ) : (
                            initials(a.actor_name)
                          )}
                        </span>
                        <div className="td-activity-body">
                          <span className="td-activity-text">
                            <strong>{a.actor_name ?? "Someone"}</strong>{" "}
                            {a.meta ? (
                              <>
                                changed {a.meta.field} from{" "}
                                <ActivityValue
                                  field={a.meta.field}
                                  value={a.meta.from}
                                />{" "}
                                to{" "}
                                <ActivityValue
                                  field={a.meta.field}
                                  value={a.meta.to}
                                />
                              </>
                            ) : (
                              renderActivityText(a.text)
                            )}
                          </span>
                          <span className="td-activity-time">
                            {fmtDateTime(a.created_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="td-tab-empty">No activity yet</div>
                ))}
              {activityTab === "comments" && (
                <textarea
                  className="td-comment-input"
                  placeholder="Add a comment…"
                />
              )}
              {activityTab === "time" && (
                <div className="td-tab-empty">No time entries yet</div>
              )}
            </div>
          </div>
        </div>

        <aside className="td-side">
          <div className="td-prop-progress">
            <span className="td-prop-section">Progress</span>
            <div className="td-progress">
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                className="td-progress-slider"
                style={{ "--td-progress": `${progress}%` } as CSSProperties}
                onChange={(e) => setDragProgress(Number(e.target.value))}
                onPointerUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  // Update detail optimistically before clearing the drag value
                  // so it doesn't briefly snap back to the old value.
                  setDetail((d) => (d ? { ...d, progress: v } : d));
                  setDragProgress(null);
                  patch({ progress: v });
                }}
                onKeyUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  setDetail((d) => (d ? { ...d, progress: v } : d));
                  setDragProgress(null);
                  patch({ progress: v });
                }}
                aria-label="Progress"
              />
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
              <span className="td-prop-k">Item ID</span>
              <span className="td-prop-v td-prop-ro">
                <svg className="td-created-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
                </svg>
                {itemId ?? "—"}
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
                {editingSP ? (
                  <input
                    className="sp-inline-input"
                    type="number"
                    min={0}
                    autoFocus
                    defaultValue={detail.story_points ?? ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      else if (e.key === "Escape") setEditingSP(false);
                    }}
                    onBlur={(e) => {
                      const v = e.target.value
                        ? Math.max(0, Math.round(Number(e.target.value)))
                        : null;
                      setEditingSP(false);
                      if (v !== detail.story_points) patch({ story_points: v });
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="sp-inline-trigger"
                    onClick={() => setEditingSP(true)}
                  >
                    <svg className="sp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M6 3h12l4 6-10 13L2 9Z" />
                      <path d="M11 3 8 9l4 13 4-13-3-6" />
                      <path d="M2 9h20" />
                    </svg>
                    {detail.story_points != null && (
                      <span className="sp-val">{detail.story_points}</span>
                    )}
                  </button>
                )}
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Time Logged</span>
              <span className="td-prop-v td-prop-ro">
                <svg className="td-created-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 1.5M9 2h6" />
                </svg>
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Sprint</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={String(detail.sprint_id ?? "")}
                  placeholder="Add sprint"
                  placeholderIcon={<SprintIcon />}
                  options={sprints.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    icon: <SprintIcon />,
                  }))}
                  onChange={(v) =>
                    patch({ sprint_id: v ? Number(v) : null } as Partial<Task>)
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
            <div className="td-prop">
              <span className="td-prop-k">Created</span>
              <span className="td-prop-v td-prop-ro">
                <svg className="td-created-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {fmtDate(detail.created_at)}
              </span>
            </div>
          </div>

          <div className="td-actions">
            <button type="button" className="td-action">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <path d="M14 3v6h6M12 12v6M9 15h6" />
              </svg>
              Add Attachment
            </button>
            <button type="button" className="td-action">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
              </svg>
              Add Link
            </button>
          </div>

        </aside>
      </div>
    </div>
  );
}
