"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useMembers } from "@/lib/queries";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskListTable, { type ListTask } from "@/components/app/TaskListTable";
import ConfirmModal from "@/components/app/team/ConfirmModal";

// /api/tasks/all returns the full task row plus its project name, so the same
// list table the project view uses can render it unchanged.
type AllTask = ListTask & { project_name: string };

const TASKS_KEY = ["tasks", "all"] as const;

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
      </div>

      <TaskListTable
        showProject
        tasks={filtered}
        members={members ?? []}
        labelSuggestions={labelSuggestions}
        projectPrefix={prefixFor}
        onUpdate={updateTask}
        onDelete={(ids) => setPendingDelete(ids)}
        onOpen={(id) => router.push(`/task/${id}`)}
        menuItems={(t) => [
          {
            label: "Delete",
            danger: true,
            onClick: () => setPendingDelete([t.id]),
          },
        ]}
        emptyText={
          tasks.length === 0
            ? "No tasks across your projects yet."
            : "No tasks match your filters."
        }
      />

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
