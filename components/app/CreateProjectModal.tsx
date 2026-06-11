"use client";

import { useEffect, useState } from "react";
import type { Project, ProjectStatus, Member } from "@/lib/types";
import Spinner from "@/components/Spinner";
import StatusDropdown from "@/components/app/StatusDropdown";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [page, setPage] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Page 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("draft");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Page 2
  const [members, setMembers] = useState<Member[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => {
        setMembers(d.members ?? []);
        if (d.my_id) setOwnerId(d.my_id); // default owner = me
      })
      .catch(() => {});
  }, []);

  function toggleMember(id: string) {
    setMemberIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        status,
        start_date: startDate || null,
        due_date: dueDate || null,
        owner_id: ownerId || null,
        manager_id: managerId || null,
        member_ids: memberIds,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not create project.");
      setSaving(false);
      return;
    }
    const project: Project = await res.json();
    onCreated(project);
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal cp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <h2>New project</h2>
          <span className="cp-step">Step {page} of 2</span>
        </div>

        {page === 1 ? (
          <>
            <div className="field">
              <label>
                Project name <span className="req">*</span>
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Website Redesign"
              />
            </div>

            <div className="field">
              <label>Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this project about? (optional)"
              />
            </div>

            <div className="field">
              <label>Status</label>
              <StatusDropdown value={status} onChange={setStatus} />
            </div>

            <div className="field-row">
              <div className="field">
                <label>Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Estimated due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>Project owner</label>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Project manager</label>
              <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">None</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Project members</label>
              <div className="cp-members">
                {members.length === 0 && (
                  <span className="cp-members-empty">No other members yet.</span>
                )}
                {members.map((m) => (
                  <label key={m.user_id} className="cp-member-check">
                    <input
                      type="checkbox"
                      checked={memberIds.includes(m.user_id)}
                      onChange={() => toggleMember(m.user_id)}
                    />
                    <span className="member-avatar sm">
                      {initials(m.name || m.email || "?")}
                    </span>
                    <span className="cp-member-name">{m.name || m.email}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="invite-err">{error}</p>}

        <div className="modal-actions">
          <div>
            {page === 2 && (
              <button className="btn" onClick={() => setPage(1)} disabled={saving}>
                Back
              </button>
            )}
          </div>
          <div className="right">
            <button className="btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            {page === 1 ? (
              <button
                className="btn btn-primary"
                onClick={() => setPage(2)}
                disabled={!name.trim()}
              >
                Next
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={create}
                disabled={!name.trim() || saving}
              >
                {saving ? (
                  <>
                    Creating
                    <Spinner />
                  </>
                ) : (
                  "Create project"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
