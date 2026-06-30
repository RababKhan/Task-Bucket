"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Member, Task, TaskStatus, TaskPriority } from "@/lib/types";
import { prefetchTaskDetail } from "@/lib/task-cache";
import Spinner from "@/components/Spinner";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
} from "@/lib/types";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import SelectField, { type SelectOption } from "@/components/app/SelectField";
import MemberPicker from "@/components/app/MemberPicker";
import DatePicker from "@/components/app/DatePicker";
import LabelsField from "@/components/app/LabelsField";

export type ListTask = Task & { assignees?: string[] };

export type RowMenuItem = {
  label: string;
  danger?: boolean;
  onClick: () => void;
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

// The task list table, mirroring the project List view row-for-row: same .tl-*
// markup + inline editors, plus selection (checkbox), drag-and-drop reorder, and
// a per-row kebab. Per-row menu items come from `menuItems`; bulk delete and
// reorder are wired via `onDelete` / `onReorder`.
export default function TaskListTable({
  tasks,
  members,
  labelSuggestions,
  projectPrefix,
  onUpdate,
  onOpen,
  onDelete,
  onReorder,
  onAddItem,
  menuItems,
  emptyText = "No tasks.",
  showHeader = true,
}: {
  tasks: ListTask[];
  members: Member[];
  labelSuggestions: string[];
  projectPrefix: string;
  onUpdate: (id: number, patch: Record<string, unknown>) => void;
  onOpen: (id: number) => void;
  onDelete?: (ids: number[]) => void;
  onReorder?: (orderedIds: number[]) => void;
  onAddItem?: (title: string) => Promise<void> | void;
  menuItems?: (task: ListTask) => RowMenuItem[];
  emptyText?: string;
  showHeader?: boolean;
}) {
  const router = useRouter();
  const [menuId, setMenuId] = useState<number | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [savingAdd, setSavingAdd] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  // Local display order so a drag reorders immediately; reconciled when the
  // incoming tasks change (new ids appended, removed ids dropped).
  const [order, setOrder] = useState<number[]>(() => tasks.map((t) => t.id));

  useEffect(() => {
    const ids = tasks.map((t) => t.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      // Avoid a state churn if nothing actually changed.
      return next.length === prev.length && next.every((v, i) => v === prev[i])
        ? prev
        : next;
    });
  }, [tasks]);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const orderedTasks = order
    .map((id) => byId.get(id))
    .filter((t): t is ListTask => !!t);

  function toggleSelect(id: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function drop(targetId: number) {
    if (dragId == null || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    setOrder((cur) => {
      const arr = [...cur];
      const from = arr.indexOf(dragId);
      const to = arr.indexOf(targetId);
      if (from < 0 || to < 0) return cur;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      onReorder?.(arr);
      return arr;
    });
    setDragId(null);
    setDragOverId(null);
  }

  function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    onDelete?.(ids);
    setSelected(new Set());
  }

  async function submitAdd() {
    const t = newTitle.trim();
    if (!t || savingAdd || !onAddItem) return;
    setSavingAdd(true);
    try {
      await onAddItem(t);
    } finally {
      setSavingAdd(false);
      setNewTitle("");
      setAddingRow(false);
    }
  }

  return (
    <div className="task-list">
      {selected.size > 0 && (
        <div className="pv-selbar">
          <span className="pv-selcount">{selected.size}</span>
          {selected.size === 1 && (
            <button
              type="button"
              className="pv-selact"
              onClick={() => onOpen([...selected][0])}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              Open
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="pv-selact danger"
              onClick={deleteSelected}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
              Delete
            </button>
          )}
        </div>
      )}

      {showHeader && (
        <div className="tl-head">
          <span />
          <span>Title</span>
          <span>Assignee</span>
          <span>Status</span>
          <span>Priority</span>
          <span>Start Date</span>
          <span>End Date</span>
          <span>Labels</span>
          <span />
        </div>
      )}

      {orderedTasks.map((task) => {
        const items = menuItems?.(task) ?? [];
        return (
          <div
            key={task.id}
            className={`tl-row${dragOverId === task.id ? " dragover" : ""}${
              dragId === task.id ? " dragging" : ""
            }${selected.has(task.id) ? " selected" : ""}`}
            draggable
            onDragStart={() => setDragId(task.id)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverId !== task.id) setDragOverId(task.id);
            }}
            onDrop={() => drop(task.id)}
            onDragEnd={() => {
              setDragId(null);
              setDragOverId(null);
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
                checked={selected.has(task.id)}
                onChange={() => toggleSelect(task.id)}
                aria-label={`Select ${task.title}`}
              />
            </span>
            <span
              className="tl-title tl-title-link"
              onClick={() => onOpen(task.id)}
              onMouseEnter={() => {
                router.prefetch(`/task/${task.id}`);
                prefetchTaskDetail(String(task.id));
              }}
            >
              <TaskTypeIcon type={task.type} size={15} />
              {task.seq != null && (
                <span className="tl-task-id">
                  {projectPrefix}-{String(task.seq).padStart(3, "0")}
                </span>
              )}
              <span className="tl-title-text">{task.title}</span>
            </span>
            <span className="tl-cell">
              <MemberPicker
                inline
                multiple
                members={members}
                value={task.assignees ?? []}
                onChange={(ids) => onUpdate(task.id, { assignees: ids })}
                placeholder="Assign"
              />
            </span>
            <span className="tl-cell">
              <SelectField
                inline
                value={task.status}
                options={STATUS_OPTS}
                onChange={(v) => onUpdate(task.id, { status: v as TaskStatus })}
              />
            </span>
            <span className="tl-cell">
              <SelectField
                inline
                value={task.priority}
                options={PRIORITY_OPTS}
                onChange={(v) => onUpdate(task.id, { priority: v as TaskPriority })}
              />
            </span>
            <span className="tl-cell">
              <DatePicker
                inline
                quick
                value={task.start_date ?? ""}
                max={task.due_date || undefined}
                onChange={(v) => onUpdate(task.id, { start_date: v || null })}
              />
            </span>
            <span className="tl-cell">
              <DatePicker
                inline
                quick
                value={task.due_date ?? ""}
                min={task.start_date || undefined}
                onChange={(v) => onUpdate(task.id, { due_date: v || null })}
              />
            </span>
            <span className="tl-cell tl-labels-cell">
              <LabelsField
                value={task.labels ?? []}
                suggestions={labelSuggestions}
                onChange={(labels) => onUpdate(task.id, { labels })}
              />
            </span>

            {items.length > 0 ? (
              <>
                <button
                  className={`pv-kebab${menuId === task.id ? " open" : ""}`}
                  aria-label="Row actions"
                  onClick={() =>
                    setMenuId(menuId === task.id ? null : task.id)
                  }
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <circle cx="12" cy="5" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="12" cy="19" r="1.8" />
                  </svg>
                </button>
                {menuId === task.id && (
                  <>
                    <div
                      className="pv-menu-backdrop"
                      onClick={() => setMenuId(null)}
                    />
                    <div className="pv-menu">
                      <button
                        className="pv-menu-item"
                        onClick={() => {
                          setMenuId(null);
                          onOpen(task.id);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                        </svg>
                        Open
                      </button>
                      {items.map((it, i) => (
                        <button
                          key={i}
                          className={`pv-menu-item${it.danger ? " danger" : ""}`}
                          onClick={() => {
                            setMenuId(null);
                            it.onClick();
                          }}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <span />
            )}
          </div>
        );
      })}

      {orderedTasks.length === 0 && <div className="tl-empty">{emptyText}</div>}

      {onAddItem && (
        <div className="tl-addbar">
          {addingRow ? (
            <div className="tl-addbar-edit">
              <input
                autoFocus
                className="tl-addbar-input"
                value={newTitle}
                placeholder="Task name, then Enter"
                disabled={savingAdd}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitAdd();
                  else if (e.key === "Escape") {
                    setAddingRow(false);
                    setNewTitle("");
                  }
                }}
              />
              <button
                type="button"
                className="pv-tool-btn"
                onClick={submitAdd}
                disabled={savingAdd || !newTitle.trim()}
              >
                {savingAdd ? <Spinner /> : "Add"}
              </button>
              <button
                type="button"
                className="pv-tool-btn"
                onClick={() => {
                  setAddingRow(false);
                  setNewTitle("");
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="tl-addbar-btn"
              onClick={() => setAddingRow(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
