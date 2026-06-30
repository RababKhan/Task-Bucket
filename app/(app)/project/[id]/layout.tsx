"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import type { Project, ProjectStatus } from "@/lib/types";
import { PROJECT_STATUS_LABELS } from "@/lib/types";
import ProjectTabs from "@/components/app/ProjectTabs";
import StatusIcon from "@/components/app/StatusIcon";

const CONFIG_NAV = [
  { key: "details", label: "Project Details", seg: "details" },
  { key: "members", label: "Project Members", seg: "members" },
  { key: "settings", label: "Custom Field", seg: "settings" },
  { key: "labels", label: "Label", seg: "labels" },
];

const CONFIG_SEGS = ["/details", "/members", "/settings", "/labels"];

type ProjectRow = Project & { progress?: number };

// Module-level cache of the projects list so navigating between a project's
// tabs (List/Board live on a different route than Sprint) shows the header
// instantly instead of flashing "…" while it refetches.
let projectsCache: ProjectRow[] | null = null;

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const id = Number(params.id);
  const pathname = usePathname();
  const router = useRouter();
  // Seed from cache so the name/status render immediately on tab switches.
  const [project, setProject] = useState<ProjectRow | null>(
    () => projectsCache?.find((x) => x.id === id) ?? null
  );

  useEffect(() => {
    // If we have a cached value, show it now; revalidate in the background.
    const cached = projectsCache?.find((x) => x.id === id) ?? null;
    if (cached) setProject(cached);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ProjectRow[]) => {
        if (Array.isArray(data)) projectsCache = data;
        const p = Array.isArray(data) ? data.find((x) => x.id === id) : null;
        setProject(p ?? cached);
      })
      .catch(() => {});
  }, [id]);

  // Feed the topbar breadcrumb ("Project › <name>") on project routes, the same
  // way the board page does.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("tb:active-project", {
        detail: project ? { name: project.name } : null,
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("tb:active-project", { detail: null })
      );
    };
  }, [project]);

  const isConfig = CONFIG_SEGS.some((s) => pathname.endsWith(s));

  if (isConfig) {
    const activeKey =
      CONFIG_NAV.find((n) => pathname.endsWith(`/${n.seg}`))?.key ?? "details";
    return (
      <div className="cfg">
        <Link href={`/?project=${id}&view=list`} className="cfg-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to project
        </Link>
        <div className="cfg-layout">
          <aside className="cfg-sidebar">
            <div className="cfg-side-title">Configuration</div>
            <nav className="cfg-nav">
              {CONFIG_NAV.map((n) => (
                <Link
                  key={n.key}
                  href={`/project/${id}/${n.seg}`}
                  className={`cfg-nav-item${activeKey === n.key ? " active" : ""}`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </aside>
          <div className="cfg-content">{children}</div>
        </div>
      </div>
    );
  }

  // Board-context routes (e.g. sprints) — use the same header as the List/Board
  // views (project badge + name + status/progress + description) so it matches.
  return (
    <>
      <div className="main-header">
        <div className="board-title">
          <div className="proj-head-row">
            <div className="proj-switcher-btn">
              <span className="proj-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
                </svg>
              </span>
              <h1>{project?.name ?? "…"}</h1>
            </div>

            {project && (
              <span className="proj-status-view">
                <StatusIcon status={project.status as ProjectStatus} size={18} />
                {PROJECT_STATUS_LABELS[project.status as ProjectStatus]}
                {project.progress != null && (
                  <span className="proj-progress-pct">{project.progress}%</span>
                )}
              </span>
            )}
          </div>
          {project?.description && <p>{project.description}</p>}
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="pv-tool-btn"
            onClick={() => router.push(`/project/${id}/details`)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Configuration
          </button>
        </div>
      </div>

      <ProjectTabs projectId={id} active="sprints" />
      {children}
    </>
  );
}
