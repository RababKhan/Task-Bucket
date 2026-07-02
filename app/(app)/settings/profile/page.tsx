"use client";

import { useSession, signOut } from "next-auth/react";
import { WORKSPACE_DOMAIN } from "@/lib/subdomain";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;
  const name = user?.name || "";
  const email = user?.email || "";
  const ws = session?.workspace;

  return (
    <>
      <div className="main-header">
        <div className="board-title">
          <h1>Profile</h1>
          <p>Your account details.</p>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-head">
          <span className="profile-avatar">
            {user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" />
            ) : (
              initials(name || email || "?")
            )}
          </span>
          <div>
            <div className="profile-name">{name || "Your account"}</div>
            <div className="profile-email">{email}</div>
          </div>
        </div>

        <div className="settings-grid">
          <div className="settings-field">
            <label>Full Name</label>
            <div className="settings-value">{name || "—"}</div>
          </div>
          <div className="settings-field">
            <label>Email Address</label>
            <div className="settings-value">{email || "—"}</div>
          </div>
          {ws && (
            <>
              <div className="settings-field">
                <label>Workspace</label>
                <div className="settings-value">{ws.name}</div>
              </div>
              <div className="settings-field">
                <label>Workspace URL</label>
                <div className="settings-value">
                  {ws.subdomain}.{WORKSPACE_DOMAIN}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">Session</div>
        <p className="settings-card-sub">Sign out of Task Bucket on this device.</p>
        <button
          className="btn btn-danger btn-sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          Logout
        </button>
      </div>
    </>
  );
}
