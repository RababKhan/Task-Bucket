"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/lib/types";
import ProjectTabs from "@/components/app/ProjectTabs";

const CONFIG_NAV = [
  { key: "details", label: "Project Details", seg: "details" },
  { key: "members", label: "Project Members", seg: "members" },
  { key: "settings", label: "Custom Field", seg: "settings" },
  { key: "labels", label: "Label", seg: "labels" },
];

const CONFIG_SEGS = ["/details", "/members", "/settings", "/labels"];

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const id = Number(params.id);
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: Project[]) => {
        const p = data.find((x) => x.id === id);
        setName(p ? p.name : "Project");
      })
      .catch(() => setName("Project"));
  }, [id]);

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

  // Board-context routes (e.g. sprints) keep the project tabs header.
  return (
    <>
      <div className="main-header">
        <div className="board-title">
          <h1>
            <Link href={`/?project=${id}&view=list`} className="proj-back-link">
              {name ?? "…"}
            </Link>
          </h1>
        </div>
      </div>
      <ProjectTabs projectId={id} active="sprints" />
      {children}
    </>
  );
}
