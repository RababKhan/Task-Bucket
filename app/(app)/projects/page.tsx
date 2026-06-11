"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/lib/types";
import Spinner from "@/components/Spinner";
import EmptyProjects from "@/components/app/EmptyProjects";

type ProjectWithCount = Project & { task_count: number };

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function createProject() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const description = window.prompt("Description (optional)") ?? "";
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const created: Project = await res.json();
    router.push(`/?project=${created.id}`);
  }

  return (
    <>
      <div className="main-header">
        <div className="board-title">
          <h1>Projects</h1>
          <p>All your projects in one place.</p>
        </div>
        {/* Header button only once at least one project exists; the empty
            state has its own Create button. */}
        {!loading && projects.length > 0 && (
          <div className="header-actions">
            <button className="btn-outline" onClick={createProject}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create Project
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="page-loading">
          <Spinner />
        </div>
      ) : projects.length === 0 ? (
        <EmptyProjects onCreate={createProject} />
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <button
              key={p.id}
              className="project-card"
              onClick={() => router.push(`/?project=${p.id}`)}
            >
              <div className="project-card-top">
                <span className="project-card-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
                    <path d="M2 13l10 5 10-5" />
                    <path d="M2 18l10 5 10-5" />
                  </svg>
                </span>
                <span className="project-card-count">{p.task_count} tasks</span>
              </div>
              <div className="project-card-name">{p.name}</div>
              {p.description && (
                <div className="project-card-desc">{p.description}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
