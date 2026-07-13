"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import { usePerms } from "@/components/app/PermissionProvider";
import EditRoleModal from "@/components/app/team/EditRoleModal";
import ProjectAccessModal from "@/components/app/team/ProjectAccessModal";
import ConfirmModal from "@/components/app/team/ConfirmModal";
import { STATUS_LABELS, type TaskStatus, type MemberDetail } from "@/lib/types";

function initials(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Detail = MemberDetail & { my_id: string; my_role: string };

export default function MemberDetailPage() {
  const params = useParams();
  const uid = String(params.uid);
  const router = useRouter();
  const perms = usePerms();

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [modal, setModal] = useState<null | "role" | "access" | "deactivate" | "remove">(
    null
  );

  const load = useCallback(async () => {
    const res = await fetch(`/api/team/members/${uid}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  async function setActive(active: boolean) {
    setErr(null);
    const res = await fetch(`/api/members/${uid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Could not update the member.");
    }
    setModal(null);
    await load();
  }

  async function remove() {
    setErr(null);
    const res = await fetch(`/api/members/${uid}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Could not remove the member.");
      setModal(null);
      return;
    }
    router.push("/directory");
  }

  if (perms.loaded && !perms.can("team_member", "view")) {
    return (
      <AccessDenied message="You do not have permission to view team members." />
    );
  }
  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }
  if (notFound || !data) {
    return <AccessDenied message="That member could not be found." backHref="/directory" backLabel="Back to directory" />;
  }

  const isSelf = data.user_id === data.my_id;
  const name = data.name || data.email || "Member";
  const canRole = perms.can("team_member", "update_role") && !isSelf;
  const canAccess = perms.can("team_member", "invite");
  const canDeactivate = perms.can("team_member", "deactivate") && !isSelf;
  const canRemove = perms.can("team_member", "remove") && !isSelf;

  return (
    <div className="dir-page">
      <div className="roles-head">
        <Link href="/directory" className="cfg-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to directory
        </Link>
      </div>

      {err && <p className="invite-err">{err}</p>}

      <div className="settings-card md-header">
        <span className="member-avatar md-avatar">{initials(name)}</span>
        <div className="md-headinfo">
          <h1 className="md-name">
            {name}
            {isSelf && <span className="you-tag">You</span>}
            {!data.active && <span className="inactive-tag">Inactive</span>}
          </h1>
          <div className="member-email">{data.email}</div>
          <div className="md-role">
            <span className={`role-pill role-${data.role}`}>{data.role_name}</span>
            {data.is_custom_role && <span className="role-badge role-badge-custom">Custom</span>}
          </div>
        </div>
        <div className="md-actions">
          {canRole && (
            <button type="button" className="btn btn-sm" onClick={() => setModal("role")}>
              Edit role
            </button>
          )}
          {canAccess && (
            <button type="button" className="btn btn-sm" onClick={() => setModal("access")}>
              Project access
            </button>
          )}
          {canDeactivate && (
            <button type="button" className="btn btn-sm" onClick={() => setModal("deactivate")}>
              {data.active ? "Deactivate" : "Activate"}
            </button>
          )}
          {canRemove && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => setModal("remove")}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="md-grid">
        <div className="settings-card">
          <div className="settings-card-title">Information</div>
          <dl className="md-info">
            <div><dt>Email</dt><dd>{data.email}</dd></div>
            <div><dt>Role</dt><dd>{data.role_name}</dd></div>
            <div><dt>Status</dt><dd>{data.active ? "Active" : "Inactive"}</dd></div>
            <div><dt>Joined</dt><dd>{fmtDate(data.joined_at)}</dd></div>
            <div><dt>Last active</dt><dd>{fmtDate(data.last_active_at)}</dd></div>
          </dl>
        </div>

        <div className="settings-card">
          <div className="settings-card-title">
            Projects <span className="member-count">{data.projects.length}</span>
          </div>
          {data.projects.length === 0 ? (
            <p className="settings-card-sub">No project access.</p>
          ) : (
            <ul className="md-list">
              {data.projects.map((p) => (
                <li key={p.id}>
                  <Link href={`/?project=${p.id}&view=list`}>{p.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="settings-card">
          <div className="settings-card-title">
            Assigned tasks <span className="member-count">{data.tasks.length}</span>
          </div>
          {data.tasks.length === 0 ? (
            <p className="settings-card-sub">No assigned tasks.</p>
          ) : (
            <ul className="md-list">
              {data.tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/task/${t.id}`}>{t.title}</Link>
                  <span className="md-task-status">
                    {STATUS_LABELS[t.status as TaskStatus] ?? t.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="settings-card">
          <div className="settings-card-title">Recent activity</div>
          {data.activity.length === 0 ? (
            <p className="settings-card-sub">No recent activity.</p>
          ) : (
            <ul className="md-activity">
              {data.activity.map((a) => (
                <li key={a.id}>
                  <span className="md-act-text">{a.text}</span>
                  <span className="md-act-date">{fmtDate(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modal === "role" && (
        <EditRoleModal
          uid={uid}
          currentRole={data.role}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "access" && (
        <ProjectAccessModal
          uid={uid}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === "deactivate" && (
        <ConfirmModal
          title={data.active ? "Deactivate member" : "Activate member"}
          body={
            data.active
              ? `${name} will lose access to the workspace immediately, but stays on the member list.`
              : `${name} will regain access to the workspace.`
          }
          confirmLabel={data.active ? "Deactivate" : "Activate"}
          danger={!!data.active}
          onConfirm={() => setActive(!data.active)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "remove" && (
        <ConfirmModal
          title="Remove member"
          body={`${name} will be removed from the workspace and lose all access. This can't be undone.`}
          confirmLabel="Remove"
          danger
          onConfirm={remove}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
