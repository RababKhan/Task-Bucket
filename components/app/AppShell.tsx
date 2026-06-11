"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import type { Project } from "@/lib/types";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const BoardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
    <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
  </svg>
);
const ProjectsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="M2 13l10 5 10-5" />
    <path d="M2 18l10 5 10-5" />
  </svg>
);
const ProfileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </svg>
);
const SettingsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);
const HelpIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
    <path d="M12 17h.01" />
  </svg>
);

function NavLink({
  href,
  label,
  icon,
  active,
  external,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  external?: boolean;
}) {
  const cls = `nav-link ${active ? "active" : ""}`;
  const inner = (
    <>
      <span className="nav-ic">{icon}</span>
      {label}
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/* ---------------- Sidebar ---------------- */

function Sidebar() {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: Project[]) => setProjects(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <Logo className="sidebar-logo-img" />
      </div>

      <nav className="app-nav">
        <NavLink href="/" label="Board" icon={BoardIcon} active={isActive("/")} />
        <NavLink href="/projects" label="Projects" icon={ProjectsIcon} active={isActive("/projects")} />

        <div className="nav-section">
          <button className="nav-section-head" onClick={() => setOpen((o) => !o)}>
            Projects
            <svg className={open ? "" : "rot"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {open &&
            projects.map((p) => (
              <Link key={p.id} href={`/?project=${p.id}`} className="nav-proj">
                <span className="nav-proj-dot" />
                {p.name}
              </Link>
            ))}
          {open && projects.length === 0 && (
            <span className="nav-proj-empty">No projects yet</span>
          )}
        </div>
      </nav>

      <div className="sidebar-bottom">
        <NavLink href="/profile" label="Profile" icon={ProfileIcon} active={isActive("/profile")} />
        <NavLink href="/settings" label="Settings" icon={SettingsIcon} active={isActive("/settings")} />
        <NavLink
          href="https://github.com/RababKhan/Task-Bucket"
          label="Help & Support"
          icon={HelpIcon}
          external
        />
      </div>
    </aside>
  );
}

/* ---------------- Topbar ---------------- */

function Topbar() {
  const { data: session } = useSession();
  const [menu, setMenu] = useState<null | "notif" | "account">(null);

  const user = session?.user;
  const name = user?.name || "Account";
  const email = user?.email || "";
  const wsName = session?.workspace?.name || "Task Bucket";

  return (
    <header className="app-topbar">
      <div className="ws-switcher-top">
        <span className="ws-avatar">{initials(wsName)}</span>
        <span className="ws-name2">{wsName}</span>
        <svg className="ws-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      <div className="topbar-actions">
        <ThemeToggle />

        <div className="menu-anchor">
          <button type="button" className="icon-btn" aria-label="Notifications" onClick={() => setMenu((m) => (m === "notif" ? null : "notif"))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            <span className="notif-badge" />
          </button>
          {menu === "notif" && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(null)} />
              <div className="menu notif-menu">
                <div className="menu-title">Notifications</div>
                <div className="notif-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  You&apos;re all caught up.
                </div>
              </div>
            </>
          )}
        </div>

        <div className="menu-anchor">
          <button type="button" className="account-btn" aria-label="Account menu" onClick={() => setMenu((m) => (m === "account" ? null : "account"))}>
            <span className="account-avatar">
              {user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" />
              ) : (
                initials(name === "Account" ? email || "?" : name)
              )}
            </span>
          </button>
          {menu === "account" && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(null)} />
              <div className="menu account-menu">
                <div className="menu-header">
                  <span className="account-avatar lg">
                    {user?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" />
                    ) : (
                      initials(name === "Account" ? email || "?" : name)
                    )}
                  </span>
                  <div className="menu-header-meta">
                    <div className="menu-header-name">{name}</div>
                    <div className="menu-header-email">{email}</div>
                  </div>
                </div>
                <Link href="/profile" className="menu-item" onClick={() => setMenu(null)}>
                  {ProfileIcon}
                  Profile
                </Link>
                <button type="button" className="menu-item danger" onClick={() => signOut({ callbackUrl: "/login" })}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 17l5-5-5-5" />
                    <path d="M21 12H9" />
                  </svg>
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ---------------- Shell ---------------- */

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-body">
        <Topbar />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
