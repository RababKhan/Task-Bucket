"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "@/components/ThemeToggle";
import { useCan } from "@/components/app/PermissionProvider";
import { usePrefetch } from "@/lib/queries";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ProjectsIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);
const DashboardIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);
const TasksIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" />
    <path d="m9 11 3 3L22 4" />
  </svg>
);
const DirectoryIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
  </svg>
);
const TimeSheetIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5M9 2h6" />
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
  onHover,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  external?: boolean;
  onHover?: () => void;
}) {
  const cls = `nav-link ${active ? "active" : ""}`;
  const inner = (
    <>
      <span className="nav-ic">{icon}</span>
      <span className="nav-label">{label}</span>
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={cls} onMouseEnter={onHover}>
      {inner}
    </Link>
  );
}

/* ---------------- Sidebar ---------------- */

function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // "Projects" stays active whenever the user is inside a project: the board
  // (root), the projects list, a project sub-page, or a task detail page.
  const projectsActive =
    pathname === "/" ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/project/") ||
    pathname.startsWith("/task/");

  // The Employee Directory requires team_member:view.
  const canViewDirectory = useCan("team_member", "view");

  const prefetch = usePrefetch();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <svg className="sidebar-logo-icon" viewBox="0 0 40 40" fill="none" aria-hidden>
          <rect x="2" y="7" width="36" height="7" rx="3.5" fill="#3f3f46" />
          <rect x="2" y="17" width="26" height="7" rx="3.5" fill="#71717a" />
          <rect x="2" y="27" width="17" height="7" rx="3.5" fill="#a1a1aa" />
        </svg>
        <span className="sidebar-logo-text">Task Bucket</span>
        <button
          type="button"
          className="sidebar-logo-collapse"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {collapsed ? (
              <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />
            ) : (
              <path d="m18 17-5-5 5-5M11 17l-5-5 5-5" />
            )}
          </svg>
        </button>
      </div>

      <nav className="app-nav">
        <NavLink href="/dashboard" label="Dashboard" icon={DashboardIcon} active={isActive("/dashboard")} />
        <NavLink href="/projects" label="Project" icon={ProjectsIcon} active={projectsActive} onHover={prefetch.projects} />
        <NavLink href="/tasks" label="Tasks" icon={TasksIcon} active={isActive("/tasks")} />
        {canViewDirectory && (
          <NavLink href="/directory" label="Employee Directory" icon={DirectoryIcon} active={isActive("/directory")} onHover={prefetch.directory} />
        )}
        <NavLink href="/timesheet" label="Time Sheet" icon={TimeSheetIcon} active={isActive("/timesheet")} />
      </nav>

      <div className="sidebar-bottom">
        <NavLink
          href="/settings"
          label="Settings"
          icon={SettingsIcon}
          active={isActive("/settings")}
        />
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

function sectionTitle(pathname: string) {
  if (pathname === "/") return "Board";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/tasks")) return "Tasks";
  if (pathname.startsWith("/directory")) return "Employee Directory";
  if (pathname.startsWith("/timesheet")) return "Time Sheet";
  // The settings sub-nav already names the section; the topbar stays "Settings".
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/task")) return "Task";
  return "Task Bucket";
}

function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [menu, setMenu] = useState<null | "notif" | "account">(null);
  const [boardProject, setBoardProject] = useState<string | null>(null);
  const [taskCrumb, setTaskCrumb] = useState<{
    project: string;
    projectId: number;
    task: string;
    parent?: { id: number; task: string } | null;
  } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  function copyTaskLink() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1500);
    });
  }

  useEffect(() => {
    function onActive(e: Event) {
      const detail = (e as CustomEvent<{ name: string } | null>).detail;
      setBoardProject(detail?.name ?? null);
    }
    function onTaskCrumb(e: Event) {
      setTaskCrumb(
        (
          e as CustomEvent<{
            project: string;
            projectId: number;
            task: string;
            parent?: { id: number; task: string } | null;
          } | null>
        ).detail ?? null
      );
    }
    window.addEventListener("tb:active-project", onActive as EventListener);
    window.addEventListener("tb:task-crumb", onTaskCrumb as EventListener);
    return () => {
      window.removeEventListener("tb:active-project", onActive as EventListener);
      window.removeEventListener("tb:task-crumb", onTaskCrumb as EventListener);
    };
  }, []);

  const user = session?.user;
  const name = user?.name || "Account";
  const email = user?.email || "";
  const title = sectionTitle(pathname);
  const showAdd = pathname.startsWith("/projects");
  const showCrumb =
    (pathname === "/" || pathname.startsWith("/project/")) && !!boardProject;
  const showTaskCrumb = pathname.startsWith("/task/") && !!taskCrumb;

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="topbar-hamburger"
        aria-label="Open menu"
        onClick={onMenuClick}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
      <div className="topbar-lead">
        {showTaskCrumb ? (
          <nav className="topbar-crumb topbar-crumb-task" aria-label="Breadcrumb">
            <Link
              href={`/?project=${taskCrumb!.projectId}`}
              className="topbar-crumb-link"
            >
              {taskCrumb!.project}
            </Link>
            <svg className="topbar-crumb-sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
            {taskCrumb!.parent && (
              <>
                <Link
                  href={`/task/${taskCrumb!.parent.id}`}
                  className="topbar-crumb-link"
                >
                  {taskCrumb!.parent.task}
                </Link>
                <svg className="topbar-crumb-sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </>
            )}
            <span className="topbar-crumb-current">{taskCrumb!.task}</span>
            <button
              type="button"
              className={`topbar-crumb-copy${linkCopied ? " is-copied" : ""}`}
              onClick={copyTaskLink}
              aria-label={linkCopied ? "Link copied" : "Copy link"}
              data-tip={linkCopied ? "Link copied" : "Copy link"}
            >
              {linkCopied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12l4 4 10-10" />
                </svg>
              ) : (
                <svg width="14" height="7" viewBox="0 0 14 7" fill="none" aria-hidden>
                  <path d="M10 0H8C7.63333 0 7.33333 0.3 7.33333 0.666667C7.33333 1.03333 7.63333 1.33333 8 1.33333H10C11.1 1.33333 12 2.23333 12 3.33333C12 4.43333 11.1 5.33333 10 5.33333H8C7.63333 5.33333 7.33333 5.63333 7.33333 6C7.33333 6.36667 7.63333 6.66667 8 6.66667H10C11.84 6.66667 13.3333 5.17333 13.3333 3.33333C13.3333 1.49333 11.84 0 10 0ZM4 3.33333C4 3.7 4.3 4 4.66667 4H8.66667C9.03333 4 9.33333 3.7 9.33333 3.33333C9.33333 2.96667 9.03333 2.66667 8.66667 2.66667H4.66667C4.3 2.66667 4 2.96667 4 3.33333ZM5.33333 5.33333H3.33333C2.23333 5.33333 1.33333 4.43333 1.33333 3.33333C1.33333 2.23333 2.23333 1.33333 3.33333 1.33333H5.33333C5.7 1.33333 6 1.03333 6 0.666667C6 0.3 5.7 0 5.33333 0H3.33333C1.49333 0 0 1.49333 0 3.33333C0 5.17333 1.49333 6.66667 3.33333 6.66667H5.33333C5.7 6.66667 6 6.36667 6 6C6 5.63333 5.7 5.33333 5.33333 5.33333Z" fill="currentColor" />
                </svg>
              )}
            </button>
          </nav>
        ) : showCrumb ? (
          <nav className="topbar-crumb" aria-label="Breadcrumb">
            <Link href="/projects" className="topbar-crumb-link">
              Project
            </Link>
            <svg className="topbar-crumb-sep" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 18 6-6-6-6" />
            </svg>
            <span className="topbar-crumb-current">{boardProject}</span>
          </nav>
        ) : (
          <h1 className="topbar-title">{title}</h1>
        )}
        {showAdd && (
          <button
            type="button"
            className="topbar-add"
            aria-label="Create project"
            onClick={() => window.dispatchEvent(new Event("tb:create-project"))}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="topbar-add-label">Create Project</span>
          </button>
        )}
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
                <Link href="/settings/profile" className="menu-item" onClick={() => setMenu(null)}>
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
  const [collapsed, setCollapsed] = useState(false);
  // Mobile drawer: the sidebar slides in over the content on small screens.
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setCollapsed(localStorage.getItem("tb-sidebar-collapsed") === "1");
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleSidebar() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("tb-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div
      className={`app-shell${collapsed ? " collapsed" : ""}${
        mobileOpen ? " mobile-open" : ""
      }`}
    >
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      {mobileOpen && (
        <div
          className="app-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="app-body">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
