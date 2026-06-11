"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Member, PendingInvite, Role } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";
import Spinner from "@/components/Spinner";

const ROLES: Role[] = ["admin", "manager", "assignee"];

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function MembersPage() {
  const params = useParams();
  const projectId = Number(params.id);

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [myRole, setMyRole] = useState<Role>("assignee");
  const [myId, setMyId] = useState("");
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("assignee");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/members?project_id=${projectId}`);
    const data = await res.json();
    setMembers(data.members ?? []);
    setInvites(data.invites ?? []);
    setMyRole(data.my_role ?? "assignee");
    setMyId(data.my_id ?? "");
  }, [projectId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const canManage = myRole === "admin" || myRole === "manager";

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setMsg(null);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, email, role }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: data.error || "Could not send invite." });
      return;
    }
    setEmail("");
    setRole("assignee");
    setMsg({ kind: "ok", text: `Invite sent to ${data.inviteUrl ? "" : ""}the address.` });
    await load();
  }

  async function changeRole(uid: string, newRole: Role) {
    await fetch(`/api/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function removeMember(m: Member) {
    if (!window.confirm(`Remove ${m.name || m.email} from the workspace?`)) return;
    await fetch(`/api/members/${m.user_id}`, { method: "DELETE" });
    await load();
  }

  async function cancelInvite(id: number) {
    await fetch(`/api/invites/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="members">
      {canManage && (
        <div className="settings-card">
          <div className="settings-card-title">Invite a member</div>
          <p className="settings-card-sub">
            They&apos;ll get an email link to join this workspace.
          </p>
          <form className="invite-form" onSubmit={invite}>
            <input
              type="email"
              className="cf-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
            <select
              className="cf-input cf-type-select"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-sm btn-primary" disabled={sending || !email.trim()}>
              {sending ? <Spinner /> : "Send invite"}
            </button>
          </form>
          {msg && (
            <p className={msg.kind === "ok" ? "invite-ok" : "invite-err"}>{msg.text}</p>
          )}
        </div>
      )}

      <div className="settings-card">
        <div className="settings-card-title">
          Members <span className="member-count">{members.length}</span>
        </div>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.user_id} className="member-row">
              <span className="member-avatar">{initials(m.name || m.email || "?")}</span>
              <div className="member-meta">
                <div className="member-name">
                  {m.name || m.email}
                  {m.user_id === myId && <span className="you-tag">You</span>}
                </div>
                <div className="member-email">{m.email}</div>
              </div>
              {myRole === "admin" && m.user_id !== myId ? (
                <select
                  className="cf-input member-role-select"
                  value={m.role}
                  onChange={(e) => changeRole(m.user_id, e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`role-pill role-${m.role}`}>{ROLE_LABELS[m.role]}</span>
              )}
              {myRole === "admin" && m.user_id !== myId && (
                <button className="st-remove" onClick={() => removeMember(m)} aria-label="Remove member">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {canManage && invites.length > 0 && (
        <div className="settings-card">
          <div className="settings-card-title">Pending invites</div>
          <ul className="member-list">
            {invites.map((inv) => (
              <li key={inv.id} className="member-row">
                <span className="member-avatar pending">✉</span>
                <div className="member-meta">
                  <div className="member-name">{inv.email}</div>
                  <div className="member-email">Invited as {ROLE_LABELS[inv.role]}</div>
                </div>
                <button className="st-remove" onClick={() => cancelInvite(inv.id)} aria-label="Cancel invite">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
