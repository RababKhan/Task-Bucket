"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Member, Project, ProjectStatus } from "@/lib/types";
import Spinner from "@/components/Spinner";
import StatusDropdown from "@/components/app/StatusDropdown";
import DatePicker from "@/components/app/DatePicker";
import MemberPicker from "@/components/app/MemberPicker";

type ProjectWithMembers = Project & {
  members?: { user_id: string }[];
};

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = Number(params.id);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("draft");
  const [managerId, setManagerId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch(`/api/members?project_id=${projectId}`).then((r) => r.json()),
    ])
      .then(([projects, mem]: [ProjectWithMembers[], { members?: Member[] }]) => {
        const p = projects.find((x) => x.id === projectId);
        if (p) {
          setName(p.name);
          setDescription(p.description ?? "");
          setStatus(p.status);
          setManagerId(p.manager_id ?? "");
          setMemberIds((p.members ?? []).map((m) => m.user_id));
          setStartDate(p.start_date ?? "");
          setDueDate(p.due_date ?? "");
        }
        setMembers(Array.isArray(mem.members) ? mem.members : []);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function save() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        status,
        manager_id: managerId || null,
        member_ids: memberIds,
        start_date: startDate || null,
        due_date: dueDate || null,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Could not save changes.");
    }
    setSaving(false);
  }

  async function del() {
    if (
      !window.confirm(
        `Delete "${name}" and all its tasks? This cannot be undone.`
      )
    )
      return;
    setDeleting(true);
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    router.push("/projects");
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="cfg-page">
      <h2 className="cfg-page-title">Project Details</h2>

      <div className="cfg-form">
        <div className="field">
          <label>
            Project Title <span className="req">*</span>
          </label>
          <input
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
          />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            rows={3}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this project about?"
          />
        </div>

        <div className="field">
          <label>Status</label>
          <StatusDropdown value={status} onChange={setStatus} />
        </div>

        <div className="field">
          <label>Project Lead</label>
          <MemberPicker
            members={members}
            value={managerId ? [managerId] : []}
            onChange={(ids) => setManagerId(ids[0] ?? "")}
            placeholder="Select lead"
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
            <label>End Date</label>
            <DatePicker
              value={dueDate}
              onChange={setDueDate}
              placeholder="End date"
            />
          </div>
        </div>

        {error && <p className="invite-err">{error}</p>}

        <div className="cfg-actions">
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={!name.trim() || saving}
          >
            {saving ? (
              <>
                Saving
                <Spinner />
              </>
            ) : (
              "Save"
            )}
          </button>
          <button className="btn btn-danger" onClick={del} disabled={deleting}>
            {deleting ? (
              <>
                Deleting
                <Spinner />
              </>
            ) : (
              "Delete This Project"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
