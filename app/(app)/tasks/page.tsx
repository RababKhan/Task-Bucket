"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useMembers } from "@/lib/queries";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_ORDER,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskListTable, { type ListTask } from "@/components/app/TaskListTable";
import ConfirmModal from "@/components/app/team/ConfirmModal";
import TaskModal, { type TaskDraft } from "@/app/TaskModal";

const EDIT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

const DELETE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

// /api/tasks/all returns the full task row plus its project name, so the same
// list table the project view uses can render it unchanged.
type AllTask = ListTask & { project_name: string };

const TASKS_KEY = ["tasks", "all"] as const;

// Sorting mirrors the Projects module: a dropdown, clicking the active field
// flips direction, and the choice is remembered.
type SortKey = "title" | "project" | "status" | "priority" | "start" | "end";
const SORT_FIELDS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "project", label: "Project" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "start", label: "Start Date" },
  { key: "end", label: "End Date" },
];
const SORT_PREF_KEY = "tb-tasks-sort";
// Undated rows sort last in ascending order rather than first.
const NO_DATE = "9999-99-99";

export default function TasksPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: TASKS_KEY,
    queryFn: () => apiGet<AllTask[]>("/api/tasks/all"),
  });
  const { data: members } = useMembers();

  // Mirror the query into local state so inline edits apply immediately,
  // the same way the project List view does.
  const [tasks, setTasks] = useState<AllTask[]>([]);
  useEffect(() => {
    if (data) setTasks(data);
  }, [data]);

  const [q, setQ] = useState("");
  const [proj, setProj] = useState("");
  const [status, setStatus] = useState("");

  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Restore the last sort, then keep it in step.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SORT_PREF_KEY);
      if (!raw) return;
      const v = JSON.parse(raw) as { sortBy?: SortKey; sortDir?: string };
      if (v.sortBy && SORT_FIELDS.some((f) => f.key === v.sortBy)) {
        setSortBy(v.sortBy);
      }
      if (v.sortDir === "asc" || v.sortDir === "desc") setSortDir(v.sortDir);
    } catch {
      // A malformed preference is not worth failing the page over.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_PREF_KEY, JSON.stringify({ sortBy, sortDir }));
    } catch {
      // Private browsing and the like — sorting still works, it just won't stick.
    }
  }, [sortBy, sortDir]);

  function applySort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  function clearSort() {
    setSortBy(null);
    setSortOpen(false);
  }

  const projects = useMemo(() => {
    const seen = new Map<number, string>();
    tasks.forEach((t) => seen.set(t.project_id, t.project_name));
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const labelSuggestions = useMemo(
    () =>
      [...new Set(tasks.flatMap((t) => t.labels ?? []))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tasks]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!term || t.title.toLowerCase().includes(term)) &&
        (!proj || t.project_id === Number(proj)) &&
        (!status || t.status === status)
    );
  }, [tasks, q, proj, status]);

  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (t: AllTask): string | number => {
      switch (sortBy) {
        case "title":
          return t.title.toLowerCase();
        case "project":
          return (t.project_name ?? "").toLowerCase();
        case "status":
          return STATUS_ORDER.indexOf(t.status as TaskStatus);
        case "priority":
          return PRIORITY_ORDER.indexOf(t.priority as TaskPriority);
        case "start":
          return t.start_date || NO_DATE;
        case "end":
          return t.due_date || NO_DATE;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [filtered, sortBy, sortDir]);

  // Each row shows its own project's id badge, since rows span projects.
  const prefixFor = (t: ListTask) =>
    (t.project_name ?? "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "TSK";

  async function updateTask(id: number, patch: Record<string, unknown>) {
    setTasks((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...patch } as AllTask) : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    qc.invalidateQueries({ queryKey: TASKS_KEY });
  }

  // Deleting is confirmed first, matching the project List view rather than
  // removing rows on a single click.
  const [pendingDelete, setPendingDelete] = useState<number[] | null>(null);
  const [editing, setEditing] = useState<AllTask | null>(null);

  async function saveTask(draft: TaskDraft) {
    if (!editing) return;
    const id = editing.id;
    setEditing(null);
    setTasks((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...draft } as AllTask) : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    qc.invalidateQueries({ queryKey: TASKS_KEY });
  }

  async function confirmDelete() {
    const ids = pendingDelete ?? [];
    setPendingDelete(null);
    if (!ids.length) return;
    setTasks((cur) => cur.filter((t) => !ids.includes(t.id)));
    await Promise.all(
      ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }))
    );
    qc.invalidateQueries({ queryKey: TASKS_KEY });
  }

  if (isLoading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="pv tasks-page">
      <div className="pv-toolbar">
        <div className="pv-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks"
          />
          {q && (
            <button
              type="button"
              className="pv-search-clear"
              onClick={() => setQ("")}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <select
          className="pv-tool-select"
          value={proj}
          onChange={(e) => setProj(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          className="pv-tool-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <div className="pv-sort">
          <button
            className={`pv-tool-btn${sortBy ? " active" : ""}`}
            type="button"
            onClick={() => setSortOpen((o) => !o)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {sortBy ? (
                sortDir === "asc" ? (
                  <path d="M4 6h10M4 12h7M4 18h4M18 19V5M18 5l-3 3M18 5l3 3" />
                ) : (
                  <path d="M4 6h10M4 12h7M4 18h4M18 5v14M18 19l-3-3M18 19l3-3" />
                )
              ) : (
                <path d="M3 7h12M3 12h8M3 17h4M17 5v14M17 19l3-3M17 19l-3-3" />
              )}
            </svg>
            Sort
            {sortBy && (
              <span className="pv-sort-tag">
                {SORT_FIELDS.find((f) => f.key === sortBy)?.label}
              </span>
            )}
          </button>
          {sortOpen && (
            <>
              <div
                className="pv-menu-backdrop"
                onClick={() => setSortOpen(false)}
              />
              <div className="pv-sort-menu">
                {SORT_FIELDS.map((f) => (
                  <button
                    key={f.key}
                    className={`pv-sort-item${sortBy === f.key ? " active" : ""}`}
                    onClick={() => applySort(f.key)}
                  >
                    {f.label}
                    {sortBy === f.key && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        {sortDir === "asc" ? (
                          <path d="m6 15 6-6 6 6" />
                        ) : (
                          <path d="m6 9 6 6 6-6" />
                        )}
                      </svg>
                    )}
                  </button>
                ))}
                {sortBy && (
                  <button className="pv-sort-clear" onClick={clearSort}>
                    Clear sort
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <TaskListTable
        showProject
        tasks={sorted}
        members={members ?? []}
        labelSuggestions={labelSuggestions}
        projectPrefix={prefixFor}
        onUpdate={updateTask}
        onDelete={(ids) => setPendingDelete(ids)}
        // ?from=tasks tells the shell to keep Tasks selected in the sidebar and
        // to start the breadcrumb at Tasks rather than at the task's project.
        onOpen={(id) => router.push(`/task/${id}?from=tasks`)}
        showOpenItem={false}
        menuItems={(t) => [
          {
            label: "Edit",
            icon: EDIT_ICON,
            onClick: () => setEditing(t as AllTask),
          },
          {
            label: "Delete",
            danger: true,
            icon: DELETE_ICON,
            onClick: () => setPendingDelete([t.id]),
          },
        ]}
        emptyText={
          tasks.length === 0
            ? "No tasks across your projects yet."
            : "No tasks match your filters."
        }
      />

      {editing && (
        <TaskModal
          task={editing}
          defaultStatus={editing.status}
          members={members ?? []}
          labelSuggestions={labelSuggestions}
          onSave={saveTask}
          onDelete={async () => {
            const id = editing.id;
            setEditing(null);
            setPendingDelete([id]);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.length > 1 ? "Delete tasks?" : "Delete task?"}
          body={
            pendingDelete.length > 1 ? (
              <>
                <b>{pendingDelete.length} tasks</b> will be deleted. This can&apos;t
                be undone.
              </>
            ) : (
              <>
                <b>
                  {tasks.find((t) => t.id === pendingDelete[0])?.title ??
                    "This task"}
                </b>{" "}
                will be deleted. This can&apos;t be undone.
              </>
            )
          }
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
