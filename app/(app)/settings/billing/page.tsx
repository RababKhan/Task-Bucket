"use client";

import { useCallback, useEffect, useState } from "react";
import Spinner from "@/components/Spinner";
import { PLANS, type PlanId, type BillingInterval } from "@/lib/plans";

type Bank = {
  beneficiary: string;
  bankName: string;
  accountNumber: string;
  branch: string;
  routing: string;
  branchCode: string;
  swift: string;
  iban: string;
  reference: string;
};

type BillingInfo = {
  plan: PlanId;
  status: string;
  interval: string | null;
  current_period_end: string | null;
  usage: { projects: number; members: number };
  limits: { projects: number | null; members: number | null };
  is_admin: boolean;
  workspace: { subdomain: string; name: string };
  contact: { email: string; bank: Bank };
  pending_request: { interval: string; created_at: string } | null;
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

const limitText = (n: number | null) => (n == null ? "Unlimited" : String(n));

const BANK_FIELDS: { key: keyof Bank; label: string }[] = [
  { key: "bankName", label: "Bank" },
  { key: "beneficiary", label: "Account name" },
  { key: "accountNumber", label: "Account number" },
  { key: "branch", label: "Branch" },
  { key: "routing", label: "Routing number" },
  { key: "branchCode", label: "Branch code" },
  { key: "swift", label: "SWIFT / BIC" },
  { key: "iban", label: "IBAN" },
  { key: "reference", label: "Reference" },
];

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.ok) setInfo(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function requestUpgrade() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/billing/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not submit your request.");
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
  if (!info) return <div className="pv">Could not load billing.</div>;

  const isPro = info.plan === "pro";
  const bankLines = BANK_FIELDS.filter((f) => info.contact.bank[f.key]);
  const amount = PLANS.pro.price[interval];

  return (
    <div className="pv billing-pv">
      <div className="billing-head">
        <h1>Billing &amp; Plan</h1>
        <p className="settings-card-sub">
          Manage your workspace subscription and see your usage.
        </p>
      </div>

      {error && <p className="invite-err">{error}</p>}

      {/* Current plan + usage */}
      <div className="billing-current">
        <div className="billing-current-row">
          <span>Current plan</span>
          <strong className={`plan-badge plan-${info.plan}`}>
            {PLANS[info.plan].name}
            {isPro && info.interval ? ` · ${info.interval}ly` : ""}
          </strong>
        </div>
        {isPro && info.current_period_end && (
          <div className="billing-current-row">
            <span>Valid until</span>
            <strong>{fmtDate(info.current_period_end)}</strong>
          </div>
        )}
        <div className="billing-usage">
          <div className="billing-usage-item">
            Projects: {info.usage.projects} / {limitText(info.limits.projects)}
          </div>
          <div className="billing-usage-item">
            Members: {info.usage.members} / {limitText(info.limits.members)}
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

      {/* Upgrade via bank transfer */}
      {isPro ? (
        <p className="settings-card-sub">
          You&apos;re on Pro — thank you! To renew or change your plan, contact{" "}
          {info.contact.email ? <strong>{info.contact.email}</strong> : "us"}.
        </p>
      ) : !info.is_admin ? (
        <p className="settings-card-sub">
          Only workspace admins can upgrade the plan.
        </p>
      ) : info.pending_request ? (
        <div className="billing-pending">
          <strong>Upgrade request received.</strong> We&apos;ll activate Pro (
          {info.pending_request.interval}ly) once we&apos;ve verified your bank
          transfer. Make sure you&apos;ve emailed your invoice and workspace
          domain to {info.contact.email || "us"}.
        </div>
      ) : (
        <div className="billing-upgrade">
          <h2 className="billing-sec-title">Upgrade to Pro by bank transfer</h2>

          <div className="billing-interval">
            <label className={`billing-int-opt${interval === "month" ? " sel" : ""}`}>
              <input
                type="radio"
                name="interval"
                checked={interval === "month"}
                onChange={() => setInterval("month")}
              />
              Monthly — ${PLANS.pro.price.month}/mo
            </label>
            <label className={`billing-int-opt${interval === "year" ? " sel" : ""}`}>
              <input
                type="radio"
                name="interval"
                checked={interval === "year"}
                onChange={() => setInterval("year")}
              />
              Yearly — ${PLANS.pro.price.year}/yr (save 2 months)
            </label>
          </div>

          <ol className="billing-steps">
            <li>
              Transfer <strong>${amount}</strong> to the account below.
            </li>
            <li>
              Email your payment invoice and your workspace domain{" "}
              <code className="billing-domain">{info.workspace.subdomain}</code>{" "}
              to{" "}
              {info.contact.email ? (
                <strong>{info.contact.email}</strong>
              ) : (
                "our billing contact"
              )}
              .
            </li>
            <li>Click the button below so we know to expect it.</li>
          </ol>

          {bankLines.length > 0 ? (
            <dl className="billing-bank">
              {bankLines.map((f) => (
                <div key={f.key} className="billing-bank-row">
                  <dt>{f.label}</dt>
                  <dd>{info.contact.bank[f.key]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="invite-err">
              Bank details aren&apos;t configured yet. See BILLING.md.
            </p>
          )}

          <button
            className="btn btn-primary"
            onClick={requestUpgrade}
            disabled={busy}
          >
            {busy ? <Spinner /> : "I've made the transfer — request activation"}
          </button>
        </div>
      )}
    </div>
  );
}
