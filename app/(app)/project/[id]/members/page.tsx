"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Member, PendingInvite } from "@/lib/types";
import { ROLE_LABELS, type Role } from "@/lib/types";
import Spinner from "@/components/Spinner";

// A role choice as returned by /api/members (system + custom, active only).
type RoleOption = { key: string; name: string };

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
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [myId, setMyId] = useState("");
  const [canInvite, setCanInvite] = useState(false);
  const [canRemove, setCanRemove] = useState(false);
  const [canAssignRoles, setCanAssignRoles] = useState(false);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("assignee");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/members?project_id=${projectId}`);
    const data = await res.json();
    setMembers(data.members ?? []);
    setInvites(data.invites ?? []);
    setRoles(data.roles ?? []);
    setMyId(data.my_id ?? "");
    setCanInvite(!!data.can_invite);
    setCanRemove(!!data.can_remove);
    setCanAssignRoles(!!data.can_assign_roles);
  }, [projectId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Display label for a role key: prefer the workspace role's name, then the
  // built-in label, then the raw key.
  const roleLabel = useMemo(() => {
    const map = new Map(roles.map((r) => [r.key, r.name]));
    return (key: string) =>
      map.get(key) ?? ROLE_LABELS[key as Role] ?? key;
  }, [roles]);

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
    setMsg({ kind: "ok", text: "Invite sent to the address." });
    await load();
  }

  async function changeRole(uid: string, newRole: string) {
    setErr(null);
    const res = await fetch(`/api/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Could not change the role.");
    }
    await load();
  }

  async function toggleActive(m: Member) {
    setErr(null);
    const res = await fetch(`/api/members/${m.user_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: m.active ? 0 : 1 }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Could not update the member.");
    }
    await load();
  }

  async function removeMember(m: Member) {
    if (!window.confirm(`Remove ${m.name || m.email} from the workspace?`)) return;
    setErr(null);
    const res = await fetch(`/api/members/${m.user_id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErr(data.error || "Could not remove the member.");
    }
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
      {err && <p className="invite-err">{err}</p>}

      {canInvite && (
        <div className="settings-card">
          <div className="settings-card-title">Invite a Member</div>
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
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
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
            <li
              key={m.user_id}
              className={`member-row${m.active ? "" : " member-inactive"}`}
            >
              <span className="member-avatar">{initials(m.name || m.email || "?")}</span>
              <div className="member-meta">
                <div className="member-name">
                  {m.name || m.email}
                  {m.user_id === myId && <span className="you-tag">You</span>}
                  {!m.active && <span className="inactive-tag">Inactive</span>}
                </div>
                <div className="member-email">{m.email}</div>
              </div>
              {canAssignRoles && m.user_id !== myId ? (
                <select
                  className="cf-input member-role-select"
                  value={m.role}
                  onChange={(e) => changeRole(m.user_id, e.target.value)}
                >
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`role-pill role-${m.role}`}>{roleLabel(m.role)}</span>
              )}
              {canAssignRoles && m.user_id !== myId && (
                <button
                  className="btn btn-xs"
                  onClick={() => toggleActive(m)}
                  data-tip={m.active ? "Deactivate member" : "Activate member"}
                >
                  {m.active ? "Deactivate" : "Activate"}
                </button>
              )}
              {canRemove && m.user_id !== myId && (
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

      {canInvite && invites.length > 0 && (
        <div className="settings-card">
          <div className="settings-card-title">Pending Invites</div>
          <ul className="member-list">
            {invites.map((inv) => (
              <li key={inv.id} className="member-row">
                <span className="member-avatar pending">✉</span>
                <div className="member-meta">
                  <div className="member-name">{inv.email}</div>
                  <div className="member-email">Invited as {roleLabel(inv.role)}</div>
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
