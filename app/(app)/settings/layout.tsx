"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePerms, useCan } from "@/components/app/PermissionProvider";

// Sub-navigation shared by all Settings pages (General, Profile, Billing,
// Roles). Billing is admin-only; Roles needs roles:view.
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // isAdmin here comes from lib/permissions.ts's hasFullAccess (Owner OR
  // Admin) — not a direct `role === "admin"` check, which used to leave an
  // Owner's own account without Workspace settings or Billing.
  const { isAdmin } = usePerms();
  const canRoles = useCan("roles", "view");

  const tabs = [
    { href: "/settings/profile", label: "Profile" },
    ...(isAdmin
      ? [{ href: "/settings/workspace", label: "Workspace settings" }]
      : []),
    ...(isAdmin ? [{ href: "/settings/billing", label: "Billing" }] : []),
    ...(canRoles
      ? [{ href: "/settings/roles", label: "Roles & Permissions" }]
      : []),
  ];

  const isActive = (t: { href: string; exact?: boolean }) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href);

  return (
    <div className="settings-shell">
      <nav className="settings-subnav">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`settings-subtab${isActive(t) ? " active" : ""}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="settings-body">{children}</div>
    </div>
  );
}
