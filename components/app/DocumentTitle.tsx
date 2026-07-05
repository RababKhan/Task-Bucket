"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useBranding } from "@/components/app/BrandingProvider";

// The section/module name for the current route (drives the browser tab title).
function pageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/tasks")) return "Tasks";
  if (pathname.startsWith("/directory")) return "Employee Directory";
  if (pathname.startsWith("/timesheet")) return "Time Sheet";
  if (pathname.startsWith("/owner")) return "Platform billing";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/task/")) return "Task";
  if (pathname.startsWith("/project")) return "Project";
  if (pathname.startsWith("/login")) return "Sign in";
  if (pathname.startsWith("/signup")) return "Sign up";
  if (pathname.startsWith("/forgot-password")) return "Reset password";
  if (pathname.startsWith("/reset-password")) return "Reset password";
  if (pathname.startsWith("/invite")) return "Accept invite";
  if (pathname === "/") return "Projects";
  return "";
}

// Sets document.title to "{Module} · {App name}" (branded), replacing the static
// metadata title. Renders nothing.
export default function DocumentTitle() {
  const pathname = usePathname();
  const { branding } = useBranding();

  useEffect(() => {
    const app = branding.name || "Task Bucket";
    const mod = pageTitle(pathname);
    document.title = mod ? `${mod} · ${app}` : app;
  }, [pathname, branding.name]);

  return null;
}
