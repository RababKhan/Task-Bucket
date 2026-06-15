"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Task } from "@/lib/types";
import Spinner from "@/components/Spinner";
import { labelColor } from "@/lib/tasks";

export default function ProjectLabelsPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tasks?project_id=${projectId}`)
      .then((r) => r.json())
      .then((d) => setTasks(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Distinct labels in use, with how many tasks carry each.
  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      for (const l of t.labels ?? []) {
        counts.set(l, (counts.get(l) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [tasks]);

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="cfg-page">
      <h2 className="cfg-page-title">Label</h2>
      <p className="cfg-page-sub">
        Labels are created on tasks. Every label used across this project&apos;s
        tasks appears here.
      </p>

      {labels.length === 0 ? (
        <div className="cfg-empty">No labels yet. Add labels when creating a task.</div>
      ) : (
        <div className="cfg-label-list">
          {labels.map(({ label, count }) => {
            const c = labelColor(label);
            return (
              <div key={label} className="cfg-label-row">
                <span
                  className="tm-chip"
                  style={{ background: c.bg, borderColor: c.border, color: c.color }}
                >
                  {label}
                </span>
                <span className="cfg-label-count">
                  {count} {count === 1 ? "task" : "tasks"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
