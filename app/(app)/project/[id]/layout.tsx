"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import type { Project } from "@/lib/types";
import ProjectTabs from "@/components/app/ProjectTabs";

type Tab = "board" | "sprints" | "members" | "settings";

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

  const active: Tab = pathname.endsWith("/sprints")
    ? "sprints"
    : pathname.endsWith("/members")
    ? "members"
    : pathname.endsWith("/settings")
    ? "settings"
    : "board";

  return (
    <>
      <div className="main-header">
        <div className="board-title">
          <h1>
            <Link href={`/?project=${id}`} className="proj-back-link">
              {name ?? "…"}
            </Link>
          </h1>
        </div>
      </div>
      <ProjectTabs projectId={id} active={active} />
      {children}
    </>
  );
}
