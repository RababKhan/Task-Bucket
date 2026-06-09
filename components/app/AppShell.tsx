"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import type { Project } from "@/lib/types";
import { WORKSPACE_DOMAIN } from "@/lib/subdomain";
import ThemeToggle from "@/components/ThemeToggle";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------- Sidebar ---------------- */

const MAIN_NAV = [
  {
    href: "/",
    label: "Board",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
        <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
      </svg>
    ),
  },
  {
    href: "/projects",
    label: "Projects",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path d="M2 13l10 5 10-5" />
        <path d="M2 18l10 5 10-5" />
      </svg>
    ),
  },
];

const ACCOUNT_NAV = [
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 3.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H8a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V8a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </svg>
    ),
  },
];

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link href={href} className={`nav-link ${active ? "active" : ""}`}>
      <span className="nav-ic">{icon}</span>
      {label}
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const wsName = session?.workspace?.name || "Task Bucket";
  const wsSub = session?.workspace?.subdomain;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="app-sidebar">
      <div className="ws-switcher">
        <div className="ws-avatar">{initials(wsName)}</div>
        <div className="ws-meta">
          <div className="ws-name2">{wsName}</div>
          {wsSub && (
            <div className="ws-sub">
              {wsSub}.{WORKSPACE_DOMAIN}
            </div>
          )}
        </div>
      </div>

      <nav className="app-nav">
        <div className="nav-group">
          <div className="nav-group-label">Main</div>
          {MAIN_NAV.map((n) => (
            <NavLink key={n.href} {...n} active={isActive(n.href)} />
          ))}
        </div>
        <div className="nav-group">
          <div className="nav-group-label">Account</div>
          {ACCOUNT_NAV.map((n) => (
            <NavLink key={n.href} {...n} active={isActive(n.href)} />
          ))}
        </div>
      </nav>

      <div className="plan-card">
        <div className="plan-row">
          <span className="plan-name">Current Plan</span>
          <span className="plan-badge">Free</span>
        </div>
        <div className="plan-bar">
          <span className="plan-fill" style={{ width: "8%" }} />
        </div>
        <div className="plan-usage">Unlimited projects &amp; tasks</div>
      </div>
    </aside>
  );
}

/* ---------------- Topbar ---------------- */

function SearchBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: Project[]) => setProjects(d))
      .catch(() => {});
  }, []);

  // ⌘K / Ctrl+K focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const matches = q
    ? projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    : projects;

  function go(id: number) {
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(`/?project=${id}`);
  }

  return (
    <div className="topbar-search">
      <svg className="search-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        ref={inputRef}
        className="search-input"
        placeholder="Search projects…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      <span className="search-keys">
        <kbd>⌘</kbd>
        <kbd>K</kbd>
      </span>

      {open && matches.length > 0 && (
        <div className="search-results">
          {matches.slice(0, 8).map((p) => (
            <button key={p.id} className="search-result" onMouseDown={() => go(p.id)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3 2 8l10 5 10-5-10-5Z" />
                <path d="M2 13l10 5 10-5" />
              </svg>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  badge,
  onClick,
  children,
}: {
  label: string;
  badge?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={onClick}>
      {children}
      {badge && <span className="notif-badge" />}
    </button>
  );
}

function Topbar() {
  const { data: session } = useSession();
  const [menu, setMenu] = useState<null | "notif" | "account">(null);
  const user = session?.user;
  const name = user?.name || "Account";
  const email = user?.email || "";

  return (
    <header className="app-topbar">
      <div className="topbar-left" />
      <SearchBox />

      <div className="topbar-actions">
        <ThemeToggle />

        <div className="menu-anchor">
          <IconButton
            label="Notifications"
            badge
            onClick={() => setMenu((m) => (m === "notif" ? null : "notif"))}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          </IconButton>
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
          <button
            type="button"
            className="account-btn"
            aria-label="Account menu"
            onClick={() => setMenu((m) => (m === "account" ? null : "account"))}
          >
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
                  </svg>
                  Profile
                </Link>
                <button
                  type="button"
                  className="menu-item danger"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
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
