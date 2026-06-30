"use client";

import Link from "next/link";

type TabKey = "list" | "board" | "sprints";
export type ActiveTab = TabKey | "members" | "settings";

const ICONS: Record<TabKey, React.ReactNode> = {
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  ),
  board: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7v7M12 7v4M16 7v9" />
    </svg>
  ),
  sprints: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 9V3M12 15v6M14.6 10.5 19.8 7.5M9.4 13.5 4.2 16.5M9.4 10.5 4.2 7.5M14.6 13.5 19.8 16.5" />
    </svg>
  ),
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "list", label: "List" },
  { key: "board", label: "Board" },
  { key: "sprints", label: "Sprint" },
];

export default function ProjectTabs({
  projectId,
  active,
}: {
  projectId: number;
  active: ActiveTab;
}) {
  function href(key: TabKey) {
    if (key === "list") return `/?project=${projectId}&view=list`;
    if (key === "board") return `/?project=${projectId}&view=board`;
    if (key === "sprints") return `/?project=${projectId}&view=sprint`;
    return `/project/${projectId}/${key}`;
  }
  return (
    <div className="project-tabs">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={href(t.key)}
          className={`ptab ${active === t.key ? "active" : ""}`}
        >
          <span className="ptab-ic">{ICONS[t.key]}</span>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
