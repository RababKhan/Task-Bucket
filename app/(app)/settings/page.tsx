"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { WORKSPACE_DOMAIN } from "@/lib/subdomain";

type Theme = "light" | "dark";

export default function SettingsPage() {
  const { data: session } = useSession();
  const ws = session?.workspace;
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <>
      <div className="main-header">
        <div className="board-title">
          <h1>Settings</h1>
          <p>Manage your workspace and appearance.</p>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Appearance</div>
        <p className="settings-card-sub">Choose how Task Bucket looks to you.</p>
        <div className="theme-choices">
          {(["light", "dark"] as Theme[]).map((t) => (
            <button
              key={t}
              className={`theme-choice ${theme === t ? "active" : ""}`}
              onClick={() => applyTheme(t)}
            >
              <span className={`theme-swatch ${t}`} />
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>

      {ws && (
        <div className="settings-card">
          <div className="settings-card-title">Workspace</div>
          <div className="settings-grid">
            <div className="settings-field">
              <label>Name</label>
              <div className="settings-value">{ws.name}</div>
            </div>
            <div className="settings-field">
              <label>URL</label>
              <div className="settings-value">
                {ws.subdomain}.{WORKSPACE_DOMAIN}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
