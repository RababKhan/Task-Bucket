"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Spinner from "@/components/Spinner";
import { PLANS, type PlanId, type BillingInterval } from "@/lib/plans";

type BillingInfo = {
  plan: PlanId;
  status: string;
  interval: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  usage: { projects: number; members: number };
  limits: { projects: number | null; members: number | null };
  is_admin: boolean;
  stripe_configured: boolean;
};

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

function limitText(n: number | null) {
  return n == null ? "Unlimited" : String(n);
}

export default function BillingPage() {
  const params = useSearchParams();
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.ok) setInfo(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function checkout(interval: BillingInterval) {
    setBusy(interval);
    setError("");
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error || "Could not start checkout.");
    setBusy(null);
  }

  async function portal() {
    setBusy("portal");
    setError("");
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    setError(data.error || "Could not open the billing portal.");
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }
  if (!info) {
    return <div className="pv">Could not load billing.</div>;
  }

  const isPro = info.plan === "pro";
  const success = params.get("success");
  const canceled = params.get("canceled");

  return (
    <div className="pv billing-pv">
      <div className="billing-head">
        <h1>Billing &amp; Plan</h1>
        <p className="settings-card-sub">
          Manage your workspace subscription and see your usage.
        </p>
      </div>

      {success && (
        <p className="invite-ok">Your subscription is active — welcome to Pro!</p>
      )}
      {canceled && (
        <p className="settings-card-sub">Checkout canceled — no changes made.</p>
      )}
      {error && <p className="invite-err">{error}</p>}
      {!info.stripe_configured && (
        <p className="invite-err">
          Billing isn&apos;t configured yet (no Stripe keys). See
          BILLING-SETUP.md.
        </p>
      )}

      {/* Current plan + usage */}
      <div className="billing-current">
        <div className="billing-current-row">
          <span>Current plan</span>
          <strong className={`plan-badge plan-${info.plan}`}>
            {PLANS[info.plan].name}
            {isPro && info.interval ? ` · ${info.interval}ly` : ""}
          </strong>
        </div>
        {isPro && (
          <div className="billing-current-row">
            <span>{info.cancel_at_period_end ? "Ends on" : "Renews on"}</span>
            <strong>{fmtDate(info.current_period_end)}</strong>
          </div>
        )}
        <div className="billing-usage">
          <div className="billing-usage-item">
            <span>
              Projects: {info.usage.projects} / {limitText(info.limits.projects)}
            </span>
          </div>
          <div className="billing-usage-item">
            <span>
              Members: {info.usage.members} / {limitText(info.limits.members)}
            </span>
          </div>
        </div>
      </div>

      {/* Plan cards */}
      <div className="billing-plans">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const plan = PLANS[id];
          const current = info.plan === id;
          return (
            <div key={id} className={`billing-plan-card${current ? " current" : ""}`}>
              <div className="billing-plan-name">{plan.name}</div>
              <div className="billing-plan-price">
                {id === "free" ? (
                  "Free"
                ) : (
                  <>
                    ${plan.price.month}
                    <span className="billing-plan-per">/mo</span>
                  </>
                )}
              </div>
              <ul className="billing-plan-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {current && <div className="billing-plan-current">Current plan</div>}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      {!info.is_admin ? (
        <p className="settings-card-sub">
          Only workspace admins can change the plan.
        </p>
      ) : isPro ? (
        <div className="billing-actions">
          <button
            className="btn btn-primary"
            onClick={portal}
            disabled={busy !== null || !info.stripe_configured}
          >
            {busy === "portal" ? <Spinner /> : "Manage billing"}
          </button>
        </div>
      ) : (
        <div className="billing-actions">
          <button
            className="btn btn-primary"
            onClick={() => checkout("month")}
            disabled={busy !== null || !info.stripe_configured}
          >
            {busy === "month" ? <Spinner /> : `Upgrade to Pro — $${PLANS.pro.price.month}/mo`}
          </button>
          <button
            className="btn"
            onClick={() => checkout("year")}
            disabled={busy !== null || !info.stripe_configured}
          >
            {busy === "year" ? (
              <Spinner />
            ) : (
              `Yearly — $${PLANS.pro.price.year}/yr (save 2 months)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}
