"use client";

import { useEffect, useState } from "react";
import type { Project, ProjectStatus, Member } from "@/lib/types";
import Spinner from "@/components/Spinner";
import StatusDropdown from "@/components/app/StatusDropdown";
import DatePicker from "@/components/app/DatePicker";
import MemberPicker from "@/components/app/MemberPicker";

type EditProject = {
  id: number;
  name: string;
  description: string;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  manager_id: string | null;
  member_ids: string[];
};

export default function CreateProjectModal({
  onClose,
  onCreated,
  project,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
  project?: EditProject;
}) {
  const isEdit = !!project;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "draft");
  const [startDate, setStartDate] = useState(project?.start_date ?? "");
  const [dueDate, setDueDate] = useState(project?.due_date ?? "");

  const [members, setMembers] = useState<Member[]>([]);
  // Owner defaults to the current user and is sent automatically (no field).
  const [ownerId, setOwnerId] = useState("");
  const [managerId, setManagerId] = useState(project?.manager_id ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(project?.member_ids ?? []);

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
        if (d.my_id) setOwnerId(d.my_id); // owner = me
      })
      .catch(() => {});
  }, []);

  async function create() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch(
      isEdit ? `/api/projects/${project!.id}` : "/api/projects",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          status,
          start_date: startDate || null,
          due_date: dueDate || null,
          ...(isEdit ? {} : { owner_id: ownerId || null }),
          manager_id: managerId || null,
          member_ids: memberIds,
        }),
      }
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(
        d.error ||
          (isEdit ? "Could not update project." : "Could not create project.")
      );
      setSaving(false);
      return;
    }
    const saved: Project = await res.json();
    onCreated(saved);
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal cp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <h2>{isEdit ? "Update Project" : "Create Project"}</h2>
        </div>

        <div className="field">
          <div className="field-labelrow">
            <label>
              Project Name <span className="req">*</span>
            </label>
            <span className="char-count">{name.length}/32</span>
          </div>
          <input
            autoFocus
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Manhattan Project"
          />
        </div>

        <div className="field">
          <div className="field-labelrow">
            <label>Description</label>
            <span className="char-count">{description.length}/500</span>
          </div>
          <textarea
            rows={3}
            maxLength={500}
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
            <label>Start Date</label>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              placeholder="Start date"
            />
          </div>
          <div className="field">
            <label>Estimated Due Date</label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="Due date"
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Project Manager</label>
            <MemberPicker
              members={members}
              value={managerId ? [managerId] : []}
              onChange={(ids) => setManagerId(ids[0] ?? "")}
              placeholder="Select Manager"
              allowNone
              searchable={false}
            />
          </div>
          <div className="field">
            <label>Project Members</label>
            <MemberPicker
              members={members}
              value={memberIds}
              onChange={setMemberIds}
              multiple
              placeholder="Add members"
            />
          </div>
        </div>

        {error && <p className="invite-err">{error}</p>}

        <div className="modal-actions">
          <div className="right">
            <button
              className="btn btn-primary"
              onClick={create}
              disabled={!name.trim() || saving}
            >
              {saving ? (
                <>
                  {isEdit ? "Updating" : "Creating"}
                  <Spinner />
                </>
              ) : isEdit ? (
                "Update Project"
              ) : (
                "Create Project"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
