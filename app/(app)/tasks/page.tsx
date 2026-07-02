"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { useMembers } from "@/lib/queries";
import { prefetchTaskDetail } from "@/lib/task-cache";
import type { TaskStatus, TaskPriority, TaskType } from "@/lib/types";
import { STATUS_LABELS, STATUS_ORDER, PRIORITY_LABELS } from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";

type AllTask = {
  id: number;
  project_id: number;
  project_name: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignees: string[];
};

const GRID = "1.7fr 150px 120px 150px 110px 110px";

function initials(text: string) {
  const p = text.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export default function TasksPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: () => apiGet<AllTask[]>("/api/tasks/all"),
  });
  const { data: members } = useMembers();

  const [q, setQ] = useState("");
  const [proj, setProj] = useState("");
  const [status, setStatus] = useState("");

  const tasks = data ?? [];
  const memberMap = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m])),
    [members]
  );
  const projects = useMemo(() => {
    const seen = new Map<number, string>();
    tasks.forEach((t) => seen.set(t.project_id, t.project_name));
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!term || t.title.toLowerCase().includes(term)) &&
        (!proj || t.project_id === Number(proj)) &&
        (!status || t.status === status)
    );
  }, [tasks, q, proj, status]);

  const open = (id: number) => router.push(`/task/${id}`);
  const warm = (id: number) => {
    router.prefetch(`/task/${id}`);
    prefetchTaskDetail(String(id));
  };

  if (isLoading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="pv">
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

      {filtered.length === 0 ? (
        <div className="pv-empty-search">
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="27" cy="27" r="18" />
            <path d="M40 40l15 15" />
          </svg>
          <p>
            {tasks.length === 0
              ? "No tasks across your projects yet."
              : "No tasks match your filters."}
          </p>
        </div>
      ) : (
        <div className="pv-table">
          <div className="pv-head" style={{ gridTemplateColumns: GRID }}>
            <span>Title</span>
            <span>Project</span>
            <span>Assignee</span>
            <span>Status</span>
            <span>Priority</span>
            <span>Due Date</span>
          </div>
          {filtered.map((t) => (
            <div
              key={t.id}
              className="pv-row"
              style={{ gridTemplateColumns: GRID }}
              onClick={() => open(t.id)}
              onMouseEnter={() => warm(t.id)}
            >
              <span className="pv-cell pv-title-cell">
                <TaskTypeIcon type={t.type} size={15} />
                <span className="pv-title">{t.title}</span>
              </span>
              <span className="pv-cell">
                <span className="tasks-proj">{t.project_name}</span>
              </span>
              <span className="pv-cell tasks-assignees">
                {t.assignees.length === 0 ? (
                  <span className="dir-muted">—</span>
                ) : (
                  t.assignees.slice(0, 3).map((id) => {
                    const m = memberMap.get(id);
                    const label = m?.name || m?.email || "?";
                    return (
                      <span key={id} className="pv-avatar" title={label}>
                        {initials(label)}
                      </span>
                    );
                  })
                )}
                {t.assignees.length > 3 && (
                  <span className="tasks-more">+{t.assignees.length - 3}</span>
                )}
              </span>
              <span className="pv-cell tasks-inline">
                <TaskStatusIcon status={t.status} size={15} />
                {STATUS_LABELS[t.status]}
              </span>
              <span className="pv-cell tasks-inline">
                <PriorityIcon priority={t.priority} size={14} />
                {PRIORITY_LABELS[t.priority]}
              </span>
              <span className="pv-cell dir-muted">{t.due_date ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
