"use client";

import { useCallback, useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import AccessDenied from "@/components/app/AccessDenied";

type Row = {
  workspace_id: string;
  subdomain: string;
  name: string;
  plan: "free" | "pro";
  status: string;
  interval: string | null;
  current_period_end: string | null;
  projects: number;
  members: number;
  pending_interval: string | null;
  pending_created_at: string | null;
};

type IntervalChoice = "month" | "year" | "none";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function isPast(iso: string | null) {
  if (!iso) return false;
  return new Date(iso.replace(" ", "T") + "Z").getTime() < Date.now();
}

// Effective Pro = plan is pro AND not past its (optional) expiry.
function proActive(r: Row) {
  return r.plan === "pro" && !isPast(r.current_period_end);
}

export default function OwnerBillingPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<Record<string, IntervalChoice>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/billing");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    if (res.ok) {
      const d = await res.json();
      setRows(d.workspaces as Row[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function activate(id: string, interval: IntervalChoice) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/owner/billing/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: id,
        interval: interval === "none" ? null : interval,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Could not activate this workspace.");
      return;
    }
    load();
  }

  async function deactivate(id: string) {
    setBusyId(id);
    setError("");
    const res = await fetch("/api/owner/billing/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) {
      setError(data.error || "Could not deactivate this workspace.");
      return;
    }
    load();
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }
  if (forbidden) {
    return (
      <AccessDenied
        message="This is a platform-owner area."
        backHref="/dashboard"
        backLabel="Back to dashboard"
      />
    );
  }
  if (!rows) return <div className="pv">Could not load billing.</div>;

  const pending = rows.filter((r) => r.pending_interval);

  return (
    <div className="pv owner-pv">
      <div className="owner-head">
        <h1 className="owner-h1">Platform billing</h1>
        <p className="owner-sub">
          Verify the bank transfer, then activate or deactivate Pro for any
          workspace. Workspaces email their invoice + domain to your billing
          address.
        </p>
      </div>

      {error && <p className="invite-err">{error}</p>}

      {pending.length > 0 && (
        <section className="owner-section">
          <h2 className="owner-h2">
            Pending upgrade requests
            <span className="owner-count">{pending.length}</span>
          </h2>
          <div className="owner-pending-list">
            {pending.map((r) => (
              <div key={r.workspace_id} className="owner-pending">
                <div className="owner-pending-info">
                  <div className="owner-ws-name">{r.name}</div>
                  <div className="owner-ws-sub">
                    {r.subdomain} · requested {r.pending_interval}ly ·{" "}
                    {fmtDate(r.pending_created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={busyId === r.workspace_id}
                  onClick={() =>
                    activate(
                      r.workspace_id,
                      r.pending_interval === "year" ? "year" : "month"
                    )
                  }
                >
                  {busyId === r.workspace_id ? (
                    <Spinner />
                  ) : (
                    `Activate ${r.pending_interval}ly`
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="owner-section">
        <h2 className="owner-h2">All workspaces</h2>
        <div className="owner-table">
          <div className="owner-row owner-head-row">
            <span>Workspace</span>
            <span>Plan</span>
            <span>Usage</span>
            <span>Renews</span>
            <span className="owner-actions-h">Action</span>
          </div>
          {rows.map((r) => {
            const active = proActive(r);
            const expired = r.plan === "pro" && !active;
            const sel = choice[r.workspace_id] ?? "month";
            return (
              <div key={r.workspace_id} className="owner-row">
                <div className="owner-ws">
                  <div className="owner-ws-name">{r.name}</div>
                  <div className="owner-ws-sub">{r.subdomain}</div>
                </div>
                <div>
                  <span
                    className={`bill-badge bill-badge-${active ? "pro" : "free"}`}
                  >
                    {active ? "Pro" : expired ? "Expired" : "Free"}
                  </span>
                </div>
                <div className="owner-usage">
                  {r.projects} proj · {r.members} mem
                </div>
                <div className="owner-renews">
                  {active
                    ? r.current_period_end
                      ? fmtDate(r.current_period_end)
                      : "No expiry"
                    : "—"}
                </div>
                <div className="owner-actions">
                  {active ? (
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={busyId === r.workspace_id}
                      onClick={() => deactivate(r.workspace_id)}
                    >
                      {busyId === r.workspace_id ? <Spinner /> : "Deactivate"}
                    </button>
                  ) : (
                    <>
                      <select
                        className="owner-iv"
                        value={sel}
                        onChange={(e) =>
                          setChoice((c) => ({
                            ...c,
                            [r.workspace_id]: e.target.value as IntervalChoice,
                          }))
                        }
                        disabled={busyId === r.workspace_id}
                      >
                        <option value="month">Monthly</option>
                        <option value="year">Yearly</option>
                        <option value="none">Perpetual</option>
                      </select>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={busyId === r.workspace_id}
                        onClick={() => activate(r.workspace_id, sel)}
                      >
                        {busyId === r.workspace_id ? <Spinner /> : "Activate"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
