"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";
import { usePerms } from "@/components/app/PermissionProvider";
import ConfirmModal from "@/components/app/team/ConfirmModal";
import { type MemberDetail } from "@/lib/types";

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
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  // Publish the breadcrumb for the topbar; clear it on unmount so other pages
  // fall back to their plain title.
  const crumbName = data?.name || data?.email || null;
  useEffect(() => {
    if (!crumbName) return;
    window.dispatchEvent(
      new CustomEvent("tb:member-crumb", { detail: { name: crumbName } })
    );
    return () => {
      window.dispatchEvent(new CustomEvent("tb:member-crumb", { detail: null }));
    };
  }, [crumbName]);

  async function remove() {
    setErr(null);
    const res = await fetch(`/api/members/${uid}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.error || "Could not remove the member.");
      setConfirmRemove(false);
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
  // The Owner is bound to workspaces.owner_id — the server rejects removal.
  const isOwner = data.role === "owner";
  const name = data.name || data.email || "Member";
  const canRemove = perms.can("team_member", "remove");
  const removeBlockReason = isOwner
    ? "The workspace Owner can't be removed."
    : isSelf
    ? "You can't remove yourself."
    : "";

  return (
    <div className="dir-page">
      {err && <p className="invite-err">{err}</p>}

      <div className="settings-card md-header">
        <span className="member-avatar md-avatar">
          {data.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.image} alt="" />
          ) : (
            initials(name)
          )}
        </span>
        <div className="md-headinfo">
          <h1 className="md-name">
            {name}
            {isSelf && <span className="you-tag">You</span>}
            {!data.active && <span className="inactive-tag">Inactive</span>}
          </h1>
          <div className="md-role">
            <span className={`role-pill role-${data.role}`}>{data.role_name}</span>
            {data.is_custom_role && <span className="role-badge role-badge-custom">Custom</span>}
          </div>
        </div>
        <div className="md-actions">
          {canRemove && (
            <button
              type="button"
              className={`pv-kebab${menuOpen ? " open" : ""}`}
              aria-label="Member actions"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
              </svg>
            </button>
          )}
          {menuOpen && (
            <>
              <div
                className="pv-menu-backdrop"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div className="pv-menu" onClick={(e) => e.stopPropagation()}>
                <button
                  className="pv-menu-item danger"
                  disabled={!!removeBlockReason}
                  data-tip={removeBlockReason || undefined}
                  data-tip-pos="left"
                  onClick={() => {
                    if (removeBlockReason) return;
                    setMenuOpen(false);
                    setConfirmRemove(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="md-grid">
        <div className="settings-card">
          <div className="settings-card-title">Information</div>
          <dl className="md-info">
            <div><dt>Designation</dt><dd>{data.designation || "—"}</dd></div>
            <div><dt>Email</dt><dd>{data.email}</dd></div>
            <div><dt>Phone</dt><dd>{data.phone || "—"}</dd></div>
            <div><dt>Role</dt><dd>{data.role_name}</dd></div>
            <div><dt>Joined</dt><dd>{fmtDate(data.joined_at)}</dd></div>
            <div><dt>Last active</dt><dd>{fmtDate(data.last_active_at)}</dd></div>
          </dl>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove Member"
          body={
            <>
              Are you sure you want to remove <strong>{name}</strong> from this
              workspace? This action cannot be undone. They&apos;ll lose all
              access immediately.
            </>
          }
          confirmLabel="Yes, Remove it"
          onConfirm={remove}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}
