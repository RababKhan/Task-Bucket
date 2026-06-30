"use client";

import { useCallback, useEffect, useState } from "react";
import type { PendingInvite } from "@/lib/types";
import { ROLE_LABELS, type Role } from "@/lib/types";

// Pending invitations list with resend / cancel actions (permission-gated by
// the parent via canResend / canCancel).
export default function PendingInvites({
  canResend,
  canCancel,
  refreshKey,
}: {
  canResend: boolean;
  canCancel: boolean;
  refreshKey: number;
}) {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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
    setMsg(null);
    const res = await fetch(`/api/team/invites/${id}/resend`, { method: "POST" });
    setBusyId(null);
    if (res.ok) setMsg("Invitation resent.");
    await load();
  }

  async function cancel(id: number) {
    setBusyId(id);
    setMsg(null);
    await fetch(`/api/team/invites/${id}/cancel`, { method: "POST" });
    setBusyId(null);
    await load();
  }

  if (!invites.length) return null;

  return (
    <div className="settings-card">
      <div className="settings-card-title">
        Pending Invites <span className="member-count">{invites.length}</span>
      </div>
      {msg && <p className="invite-ok">{msg}</p>}
      <ul className="member-list">
        {invites.map((inv) => (
          <li key={inv.id} className="member-row">
            <span className="member-avatar pending">✉</span>
            <div className="member-meta">
              <div className="member-name">{inv.email}</div>
              <div className="member-email">
                Invited as {ROLE_LABELS[inv.role as Role] ?? inv.role}
                {inv.project_access.length > 0 &&
                  ` · ${inv.project_access.length} project${
                    inv.project_access.length === 1 ? "" : "s"
                  }`}
              </div>
            </div>
            {canResend && (
              <button
                type="button"
                className="btn btn-xs"
                onClick={() => resend(inv.id)}
                disabled={busyId === inv.id}
              >
                Resend
              </button>
            )}
            {canCancel && (
              <button
                type="button"
                className="btn btn-xs btn-danger"
                onClick={() => cancel(inv.id)}
                disabled={busyId === inv.id}
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
