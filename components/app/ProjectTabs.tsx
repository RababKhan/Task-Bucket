"use client";

import Link from "next/link";

type Tab = "board" | "sprints" | "members" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "board", label: "Board" },
  { key: "sprints", label: "Sprints" },
  { key: "members", label: "Members" },
  { key: "settings", label: "Settings" },
];

export default function ProjectTabs({
  projectId,
  active,
}: {
  projectId: number;
  active: Tab;
}) {
  function href(key: Tab) {
    return key === "board"
      ? `/?project=${projectId}`
      : `/project/${projectId}/${key}`;
  }
  return (
    <div className="project-tabs">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          className={`ptab ${active === t.key ? "active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
