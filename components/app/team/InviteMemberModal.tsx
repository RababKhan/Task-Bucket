"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";

type RoleOption = { key: string; name: string };
type ProjectOption = { id: number; name: string };

// Invite a new team member to the workspace, with role + initial project access
// + an optional message. Project options are scoped by the API to what the
// inviter may grant.
export default function InviteMemberModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("assignee");
  const [projectIds, setProjectIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/team/invite")
      .then((r) => r.json())
      .then((d) => {
        setRoles(d.roles ?? []);
        setProjects(d.projects ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleProject(id: number) {
    setProjectIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setError("");
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        role,
        project_access: projectIds,
        message: message.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error || "Could not send the invite.");
      return;
    }
    onInvited();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal cp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <h2>Invite a team member</h2>
        </div>

        {loading ? (
          <div className="page-loading">
            <Spinner />
          </div>
        ) : (
          <form className="invite-modal-form" onSubmit={submit}>
            <div className="field">
              <label>
                Email <span className="req">*</span>
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div className="field">
              <label>Role</label>
              <select
                className="cf-input"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Project access</label>
              {projects.length === 0 ? (
                <p className="settings-card-sub">
                  No projects available to grant.
                </p>
              ) : (
                <div className="invite-project-list">
                  {projects.map((p) => (
                    <label key={p.id} className="invite-project-item">
                      <input
                        type="checkbox"
                        checked={projectIds.includes(p.id)}
                        onChange={() => toggleProject(p.id)}
                      />
                      <span>{p.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <label>Message (optional)</label>
              <textarea
                rows={3}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a personal note to the invite email."
              />
            </div>

            {error && <p className="invite-err">{error}</p>}

            <div className="confirm-actions">
              <button type="button" className="btn btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={sending || !email.trim()}
              >
                {sending ? <Spinner /> : "Send invite"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
