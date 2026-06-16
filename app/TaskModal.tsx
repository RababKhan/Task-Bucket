"use client";

import { useEffect, useState } from "react";
import type {
  Member,
  Task,
  TaskPriority,
  TaskSeverity,
  TaskStatus,
  TaskType,
} from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
  TASK_TYPE_ORDER,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import { useAutoFocus } from "@/lib/useAutoFocus";
import DatePicker from "@/components/app/DatePicker";
import MemberPicker from "@/components/app/MemberPicker";
import SelectField, { type SelectOption } from "@/components/app/SelectField";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";
import RichTextEditor from "@/components/app/RichTextEditor";
import { labelColor } from "@/lib/tasks";

const STATUS_OPTS: SelectOption[] = STATUS_ORDER.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  icon: <TaskStatusIcon status={s} size={16} />,
}));
function PriorityFlag({ color }: { color: string }) {
  return (
    <svg className="status-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 4c3-1.6 6 1.4 12 0v8c-6 1.4-9-1.6-12 0z" fill={color} />
      <path d="M6 21V3" />
    </svg>
  );
}

const PRIORITY_OPTS: SelectOption[] = [
  { value: "critical", label: "Critical", icon: <PriorityFlag color="var(--prio-critical)" /> },
  { value: "high", label: "High", icon: <PriorityFlag color="var(--prio-high)" /> },
  { value: "medium", label: "Medium", icon: <PriorityFlag color="var(--prio-medium)" /> },
  { value: "low", label: "Low", icon: <PriorityFlag color="var(--prio-low)" /> },
];
function SeverityBars({ level, color }: { level: number; color: string }) {
  // Three ascending bars; the first `level` bars take the severity color, the
  // rest stay muted.
  const bars = [
    { x: 2, h: 5 },
    { x: 7, h: 9 },
    { x: 12, h: 13 },
  ];
  return (
    <svg className="status-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={15 - b.h}
          width="3"
          height={b.h}
          rx="1"
          fill={i < level ? color : "var(--border)"}
        />
      ))}
    </svg>
  );
}

const SEVERITY_OPTS: SelectOption[] = [
  { value: "critical", label: "Critical", icon: <SeverityBars level={3} color="#e5484d" /> },
  { value: "major", label: "Major", icon: <SeverityBars level={3} color="#f97316" /> },
  { value: "moderate", label: "Moderate", icon: <SeverityBars level={2} color="#38bdf8" /> },
  { value: "low", label: "Low", icon: <SeverityBars level={1} color="#16a34a" /> },
];

export type TaskDraft = {
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  severity: TaskSeverity | null;
  story_points: number | null;
  start_date: string;
  due_date: string;
  labels: string[];
  assignees: string[];
};


export default function TaskModal({
  task,
  defaultStatus,
  members,
  labelSuggestions = [],
  onSave,
  onDelete,
  onClose,
}: {
  task: (Task & { assignees?: string[] }) | null; // null = creating
  defaultStatus: TaskStatus;
  members: Member[];
  labelSuggestions?: string[];
  onSave: (draft: TaskDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: task?.title ?? "",
    description: task?.description ?? "",
    type: task?.type ?? "task",
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? "medium",
    severity: task?.severity ?? "moderate",
    story_points: task?.story_points ?? null,
    start_date: task?.start_date ?? "",
    due_date: task?.due_date ?? "",
    labels: task?.labels ?? [],
    assignees: task?.assignees ?? [],
  });
  const [labelInput, setLabelInput] = useState("");
  const [labelFocus, setLabelFocus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addLabelValue(value: string) {
    const v = value.trim().slice(0, 24);
    if (!v) return;
    if (!draft.labels.some((l) => l.toLowerCase() === v.toLowerCase())) {
      set("labels", [...draft.labels, v].slice(0, 12));
    }
    setLabelInput("");
  }

  function addLabel() {
    addLabelValue(labelInput);
  }

  const labelMatches = labelSuggestions
    .filter(
      (s) => !draft.labels.some((l) => l.toLowerCase() === s.toLowerCase())
    )
    .filter((s) =>
      s.toLowerCase().includes(labelInput.trim().toLowerCase())
    )
    .slice(0, 10);

  function removeLabel(i: number) {
    set(
      "labels",
      draft.labels.filter((_, idx) => idx !== i)
    );
  }

  async function handleSave() {
    if (!draft.title.trim() || busy) return;
    setSaving(true);
    try {
      // Severity applies only to bugs; story points only to stories/tasks.
      await onSave({
        ...draft,
        severity: draft.type === "bug" ? draft.severity : null,
        story_points: draft.type === "bug" ? null : draft.story_points,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  const modalRef = useAutoFocus<HTMLDivElement>();

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal task-modal"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="tm-head">
          <h2>{task ? "Edit Task" : "Create Task"}</h2>
        </div>

        <div className="tm-body">
          {/* Type selector */}
          <div className="field">
            <label>Type</label>
            <div className="tm-types">
              {TASK_TYPE_ORDER.map((t) => {
                const active = draft.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`tm-type${active ? " active" : ""}`}
                    style={
                      active
                        ? {
                            borderColor: TASK_TYPE_COLORS[t],
                            color: TASK_TYPE_COLORS[t],
                          }
                        : undefined
                    }
                    onClick={() => set("type", t)}
                  >
                    <span className="tm-type-ic">
                      <TaskTypeIcon type={t} size={15} />
                    </span>
                    {TASK_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Task name */}
          <div className="field">
            <div className="field-labelrow">
              <label>
                {draft.type === "bug"
                  ? "Bug Title"
                  : draft.type === "story"
                  ? "Story Name"
                  : "Task Name"}{" "}
                <span className="tm-req">*</span>
              </label>
              <span className="char-count">{draft.title.length}/128</span>
            </div>
            <input
              value={draft.title}
              required
              aria-required="true"
              maxLength={128}
              placeholder="What needs to be done?"
              onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          {/* Assignee + Status */}
          <div className="field-row">
            <div className="field">
              <label>Assignee</label>
              <MemberPicker
                members={members}
                value={draft.assignees}
                onChange={(next) => set("assignees", next)}
                multiple
                placeholder="Add assignees"
              />
            </div>
            <div className="field">
              <label>Status</label>
              <SelectField
                value={draft.status}
                options={STATUS_OPTS}
                onChange={(v) => set("status", v as TaskStatus)}
              />
            </div>
          </div>

          {/* Priority + (Severity for bugs, Story Points otherwise) */}
          <div className="field-row">
            <div className="field">
              <label>Priority</label>
              <SelectField
                value={draft.priority}
                options={PRIORITY_OPTS}
                onChange={(v) => set("priority", v as TaskPriority)}
              />
            </div>
            {draft.type === "bug" ? (
              <div className="field">
                <label>Severity</label>
                <SelectField
                  value={draft.severity ?? "moderate"}
                  options={SEVERITY_OPTS}
                  onChange={(v) => set("severity", v as TaskSeverity)}
                />
              </div>
            ) : (
              <div className="field">
                <label>
                  Story Points
                  <span className="field-tip" tabIndex={0}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 16v-4M12 8h.01" />
                    </svg>
                    <span className="field-tip-box" role="tooltip">
                      <strong>Story Point Guide</strong>
                      <span><b>1</b> — Trivial. Text/CSS fixes</span>
                      <span><b>2</b> — Small. Clear, low risk.</span>
                      <span><b>3</b> — Medium. Standard feature work.</span>
                      <span><b>5</b> — Large. Complex or needs research.</span>
                      <span><b>8</b> — Very Large. Heavy dependencies.</span>
                      <span><b>13</b> — Epic. Break this task down.</span>
                    </span>
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.story_points ?? ""}
                  placeholder="—"
                  onChange={(e) =>
                    set(
                      "story_points",
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            )}
          </div>

          {/* Labels */}
          <div className="field tm-labels-field">
              <label>Labels</label>
              <div className="tm-labels">
              {draft.labels.map((l, i) => {
                const c = labelColor(l);
                return (
                <span
                  key={`${l}-${i}`}
                  className="tm-chip"
                  style={{ background: c.bg, borderColor: c.border, color: c.color }}
                >
                  {l}
                  <button
                    type="button"
                    aria-label={`Remove ${l}`}
                    onClick={() => removeLabel(i)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
                );
              })}
              <input
                className="tm-label-input"
                value={labelInput}
                placeholder={
                  draft.labels.length
                    ? "Add (press Enter)"
                    : "Type a label and press Enter"
                }
                onChange={(e) => setLabelInput(e.target.value)}
                onFocus={() => setLabelFocus(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addLabel();
                  } else if (
                    e.key === "Backspace" &&
                    !labelInput &&
                    draft.labels.length
                  ) {
                    removeLabel(draft.labels.length - 1);
                  }
                }}
                onBlur={() => {
                  addLabel();
                  setLabelFocus(false);
                }}
              />
            </div>
            {labelFocus && labelMatches.length > 0 && (
              <div className="tm-label-suggest">
                {labelMatches.map((s) => {
                  const c = labelColor(s);
                  return (
                    <button
                      type="button"
                      key={s}
                      className="tm-suggest-row"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addLabelValue(s);
                      }}
                    >
                      <span
                        className="tm-chip"
                        style={{ background: c.bg, borderColor: c.border, color: c.color }}
                      >
                        {s}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Start + End Date */}
          <div className="field-row">
            <div className="field">
              <label>Start Date</label>
              <DatePicker
                value={draft.start_date}
                max={draft.due_date || undefined}
                quick
                onChange={(v) => set("start_date", v)}
                placeholder="Select start date"
              />
            </div>
            <div className="field">
              <label>End Date</label>
              <DatePicker
                value={draft.due_date}
                min={draft.start_date || undefined}
                quick
                onChange={(v) => set("due_date", v)}
                placeholder="Select end date"
              />
            </div>
          </div>

          {/* Description */}
          <div className="field">
            <label>Description</label>
            <RichTextEditor
              value={draft.description}
              onChange={(html) => set("description", html)}
              placeholder="Add details (optional)"
            />
          </div>

          {/* Attachment (placeholder — uploads not wired yet) */}
          <div className="field">
            <label>Attachment</label>
            <div className="tm-attach" aria-disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 16V4M8 8l4-4 4 4" />
                <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
              </svg>
              <span>
                Drag &amp; drop or <b>browse</b>
              </span>
              <span className="tm-attach-soon">Coming soon</span>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <div>
            {task && (
              <button
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={busy}
              >
                {deleting ? (
                  <>
                    Deleting
                    <Spinner />
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!draft.title.trim() || busy}
            >
              {saving ? (
                <>
                  Saving
                  <Spinner />
                </>
              ) : task ? (
                "Save"
              ) : (
                "Create"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
