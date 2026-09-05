"use client";

import { useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import SelectField from "@/components/app/SelectField";
import FieldError from "@/components/FieldError";

type RoleOption = { key: string; name: string };

// Invite a new team member to the workspace with a role.
export default function InviteMemberModal({
  onClose,
  onInvited,
}: {
  onClose: () => void;
  onInvited: () => void;
}) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("assignee");
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
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        project_access: [],
        message: null,
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
                className={error ? "invalid" : undefined}
                aria-invalid={error ? true : undefined}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="name@example.com"
              />
              <FieldError message={error} />
            </div>

            <div className="field">
              <label>Role</label>
              <SelectField
                value={role}
                onChange={setRole}
                options={roles.map((r) => ({ value: r.key, label: r.name }))}
                placeholder="Select a role"
              />
            </div>

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
