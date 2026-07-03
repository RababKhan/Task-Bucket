"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { prefetchTaskDetail } from "@/lib/task-cache";
import type {
  TaskStatus,
  TaskPriority,
  TaskType,
  ProjectStatus,
} from "@/lib/types";
import {
  STATUS_LABELS,
  PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import StatusIcon from "@/components/app/StatusIcon";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";

type MyTask = {
  id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  type: TaskType;
  project_name: string;
};
type ProjRow = {
  id: number;
  name: string;
  status: ProjectStatus;
  task_count: number;
  done_count: number;
};
type SprintRow = {
  id: number;
  project_id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  project_name: string;
  task_count: number;
  done_count: number;
};
type Activity = {
  id: number;
  text: string;
  created_at: string;
  actor_name: string | null;
  task_id: number;
  task_title: string;
  project_name: string;
};
type Dash = {
  stats: {
    my_open_tasks: number;
    overdue: number;
    projects: number;
    active_sprints: number;
  };
  my_tasks: MyTask[];
  projects: ProjRow[];
  sprints: SprintRow[];
  activity: Activity[];
};

const today = () => new Date().toISOString().slice(0, 10);
const pct = (done: number, total: number) =>
  total > 0 ? Math.round((done / total) * 100) : 0;

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtRelative(iso: string) {
  const d = new Date(iso.replace(" ", "T") + "Z");
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function fmtAgo(ms: number) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const WIDGETS = [
  { key: "tasks", label: "My tasks" },
  { key: "sprints", label: "Active sprints" },
  { key: "projects", label: "Projects" },
  { key: "activity", label: "Recent activity" },
] as const;
const RANGES = [7, 30, 90] as const;
const rangeLabel = (r: number) => `Last ${r} days`;

function Meter({ value }: { value: number }) {
  return (
    <div
      className="db-meter"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="db-meter-fill" style={{ width: `${value}%` }} />
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const firstName = (session?.user?.name || "").split(" ")[0];

  const [range, setRange] = useState(30);
  const [menu, setMenu] = useState<null | "range" | "customize">(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  // Persisted widget visibility (Customize menu).
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tb-dash-hidden");
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {}
  }, []);
  function toggleWidget(key: string) {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem("tb-dash-hidden", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  // Keep "Updated Xm ago" fresh.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () => apiGet<Dash>(`/api/dashboard?range=${range}`),
  });

  if (isLoading || !data) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  const { stats, my_tasks, projects, sprints, activity } = data;
  const t = today();

  const TILES = [
    { label: "My open tasks", value: stats.my_open_tasks, tone: "" },
    {
      label: "Overdue",
      value: stats.overdue,
      tone: stats.overdue > 0 ? "danger" : "",
    },
    { label: "Projects", value: stats.projects, tone: "" },
    { label: "Active sprints", value: stats.active_sprints, tone: "" },
  ];

  return (
    <div className="db">
      <div className="db-head">
        <div className="db-head-left">
          <h1>
            {greeting()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="db-sub">
            {stats.overdue === 0
              ? "You're all caught up for today."
              : `You have ${stats.overdue} overdue task${stats.overdue === 1 ? "" : "s"}.`}
            {!!dataUpdatedAt && (
              <span className="db-updated">
                <span className="db-dot" /> Updated {fmtAgo(dataUpdatedAt)}
              </span>
            )}
          </p>
        </div>

        <div className="db-controls">
          {/* Customize — show/hide widgets */}
          <div className="menu-anchor">
            <button
              className="db-ctrl"
              onClick={() => setMenu((m) => (m === "customize" ? null : "customize"))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="21" y1="4" x2="14" y2="4" />
                <line x1="10" y1="4" x2="3" y2="4" />
                <line x1="21" y1="12" x2="12" y2="12" />
                <line x1="8" y1="12" x2="3" y2="12" />
                <line x1="21" y1="20" x2="16" y2="20" />
                <line x1="12" y1="20" x2="3" y2="20" />
                <line x1="14" y1="2" x2="14" y2="6" />
                <line x1="8" y1="10" x2="8" y2="14" />
                <line x1="16" y1="18" x2="16" y2="22" />
              </svg>
              Customize
              <svg className={`db-chev${menu === "customize" ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {menu === "customize" && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(null)} />
                <div className="db-menu">
                  {WIDGETS.map((w) => (
                    <label key={w.key} className="db-menu-check">
                      <input
                        type="checkbox"
                        checked={!hidden.has(w.key)}
                        onChange={() => toggleWidget(w.key)}
                      />
                      {w.label}
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Date range — scopes recent activity */}
          <div className="menu-anchor">
            <button
              className="db-ctrl"
              onClick={() => setMenu((m) => (m === "range" ? null : "range"))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {rangeLabel(range)}
              <svg className={`db-chev${menu === "range" ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {menu === "range" && (
              <>
                <div className="menu-backdrop" onClick={() => setMenu(null)} />
                <div className="db-menu">
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      className={`db-menu-item${range === r ? " active" : ""}`}
                      onClick={() => {
                        setRange(r);
                        setMenu(null);
                      }}
                    >
                      {rangeLabel(r)}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button
            className={`db-ctrl db-ctrl-icon${isFetching ? " spinning" : ""}`}
            onClick={() => refetch()}
            aria-label="Refresh"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 11a8.1 8.1 0 0 0-15.5-2m-.5-4v4h4" />
              <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="db-tiles">
        {TILES.map((tile) => (
          <div
            key={tile.label}
            className={`db-tile${tile.tone ? " " + tile.tone : ""}`}
          >
            <div className="db-tile-value">{tile.value}</div>
            <div className="db-tile-label">{tile.label}</div>
          </div>
        ))}
      </div>

      <div className="db-grid">
        {!hidden.has("tasks") && (
        <section className="db-card">
          <div className="db-card-head">
            <h2>My tasks</h2>
            <button className="db-link" onClick={() => router.push("/tasks")}>
              View all
            </button>
          </div>
          {my_tasks.length === 0 ? (
            <p className="db-empty">Nothing assigned to you right now. 🎉</p>
          ) : (
            <ul className="db-list">
              {my_tasks.map((task) => {
                const overdue =
                  task.due_date && task.status !== "done" && task.due_date < t;
                return (
                  <li
                    key={task.id}
                    className="db-task"
                    onClick={() => router.push(`/task/${task.id}`)}
                    onMouseEnter={() => prefetchTaskDetail(String(task.id))}
                  >
                    <TaskTypeIcon type={task.type} size={14} />
                    <span className="db-task-title">{task.title}</span>
                    <span className="db-proj">{task.project_name}</span>
                    <span className="db-task-meta">
                      <PriorityIcon priority={task.priority} size={13} />
                      <span className="db-status">
                        <TaskStatusIcon status={task.status} size={13} />
                        {STATUS_LABELS[task.status]}
                      </span>
                      {task.due_date && (
                        <span className={`db-due${overdue ? " overdue" : ""}`}>
                          {fmtDate(task.due_date)}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}

        {!hidden.has("sprints") && (
        <section className="db-card">
          <div className="db-card-head">
            <h2>Active sprints</h2>
          </div>
          {sprints.length === 0 ? (
            <p className="db-empty">No active sprints.</p>
          ) : (
            <ul className="db-list">
              {sprints.map((s) => (
                <li
                  key={s.id}
                  className="db-sprint"
                  onClick={() =>
                    router.push(`/?project=${s.project_id}&view=sprint`)
                  }
                >
                  <div className="db-sprint-top">
                    <span className="db-sprint-name">{s.name}</span>
                    <span className="db-proj">{s.project_name}</span>
                  </div>
                  <Meter value={pct(s.done_count, s.task_count)} />
                  <div className="db-sprint-sub">
                    <span>
                      {s.done_count}/{s.task_count} done
                    </span>
                    <span>
                      {fmtDate(s.start_date)} – {fmtDate(s.end_date)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {!hidden.has("projects") && (
        <section className="db-card">
          <div className="db-card-head">
            <h2>Projects</h2>
            <button className="db-link" onClick={() => router.push("/projects")}>
              View all
            </button>
          </div>
          {projects.length === 0 ? (
            <p className="db-empty">No projects yet.</p>
          ) : (
            <ul className="db-list">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="db-project"
                  onClick={() => router.push(`/?project=${p.id}&view=list`)}
                >
                  <div className="db-project-top">
                    <span className="db-project-name">{p.name}</span>
                    <span className="db-project-status">
                      <StatusIcon status={p.status} size={14} />
                      {PROJECT_STATUS_LABELS[p.status]}
                    </span>
                  </div>
                  <Meter value={pct(p.done_count, p.task_count)} />
                  <div className="db-sprint-sub">
                    <span>{pct(p.done_count, p.task_count)}% complete</span>
                    <span>{p.task_count} tasks</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}

        {!hidden.has("activity") && (
        <section className="db-card">
          <div className="db-card-head">
            <h2>Recent activity</h2>
          </div>
          {activity.length === 0 ? (
            <p className="db-empty">No recent activity.</p>
          ) : (
            <ul className="db-list">
              {activity.map((a) => (
                <li
                  key={a.id}
                  className="db-activity"
                  onClick={() => router.push(`/task/${a.task_id}`)}
                >
                  <span className="db-activity-dot" aria-hidden />
                  <div className="db-activity-body">
                    <div className="db-activity-text">
                      <strong>{a.actor_name || "Someone"}</strong> {a.text}
                    </div>
                    <div className="db-activity-sub">
                      {a.task_title} · {a.project_name} ·{" "}
                      {fmtRelative(a.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
