"use client";

import { useEffect, useState } from "react";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { useAutoFocus } from "@/lib/useAutoFocus";

export type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string;
};

export default function TaskModal({
  task,
  defaultStatus,
  onSave,
  onDelete,
  onClose,
}: {
  task: Task | null; // null = creating
  defaultStatus: TaskStatus;
  onSave: (draft: TaskDraft) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? "medium",
    due_date: task?.due_date ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const busy = saving || deleting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (!draft.title.trim() || busy) return;
    setSaving(true);
    try {
      await onSave(draft);
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
        className="modal"
        ref={modalRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{task ? "Edit task" : "New task"}</h2>

        <div className="field">
          <label>Title</label>
          <input
            value={draft.title}
            placeholder="What needs to be done?"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            rows={3}
            value={draft.description}
            placeholder="Add details (optional)"
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Status</label>
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({ ...draft, status: e.target.value as TaskStatus })
              }
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select
              value={draft.priority}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  priority: e.target.value as TaskPriority,
                })
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Due date</label>
          <input
            type="date"
            value={draft.due_date}
            onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
          />
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
