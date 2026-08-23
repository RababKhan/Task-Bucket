"use client";

import { useCallback, useEffect, useState } from "react";
import type { PendingInvite } from "@/lib/types";

// Pending invitations rendered as rows inside the directory table (so they line
// up with the Member / Email / Role columns). Permission-gated by the parent via
// canResend / canCancel; `grid` is the table's shared column template.
export default function PendingInvites({
  canResend,
  canCancel,
  refreshKey,
  grid,
}: {
  canResend: boolean;
  canCancel: boolean;
  refreshKey: number;
  grid: string;
}) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/team/invites");
    if (!res.ok) return;
    const data = await res.json();
    setInvites(data.invites ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function resend(id: number) {
    setBusyId(id);
    await fetch(`/api/team/invites/${id}/resend`, { method: "POST" });
    setBusyId(null);
    await load();
  }

  async function cancel(id: number) {
    setBusyId(id);
    await fetch(`/api/team/invites/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    await load();
  }

  if (!invites.length) return null;

  return (
    <>
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="pv-row dir-invite-row"
          style={{ gridTemplateColumns: grid }}
        >
          <span className="pv-cell pv-title-cell">
            <span className="pv-avatar dir-invite-avatar">✉</span>
            <span className="pv-title dir-invite-name">Pending invite</span>
          </span>
          <span className="pv-cell dir-email">{inv.email}</span>
          <span className="pv-cell dir-invite-role">
            <span className="dir-role">{inv.role_name}</span>
            {(canResend || canCancel) && (
              <button
                type="button"
                className={`pv-kebab${menuId === inv.id ? " open" : ""}`}
                aria-label="Invite actions"
                disabled={busyId === inv.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === inv.id ? null : inv.id);
                }}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
            )}
            {menuId === inv.id && (
              <>
                <div
                  className="pv-menu-backdrop"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId(null);
                  }}
                />
                <div className="pv-menu" onClick={(e) => e.stopPropagation()}>
                  {canResend && (
                    <button
                      className="pv-menu-item"
                      onClick={() => {
                        setMenuId(null);
                        resend(inv.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M22 2 11 13" />
                        <path d="M22 2 15 22l-4-9-9-4 20-7z" />
                      </svg>
                      Resend
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="pv-menu-item danger"
                      onClick={() => {
                        setMenuId(null);
                        cancel(inv.id);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M15 9l-6 6M9 9l6 6" />
                      </svg>
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}
          </span>
        </div>
      ))}
    </>
  );
}
