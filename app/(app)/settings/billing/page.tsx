"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function Check() {
  return (
    <svg className="bill-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function UsageMeter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null;
}) {
  const unlimited = limit == null;
  const pct = unlimited
    ? 100
    : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const near = !unlimited && limit > 0 && used / limit >= 0.8;
  return (
    <div className="bill-meter">
      <div className="bill-meter-top">
        <span className="bill-meter-label">{label}</span>
        <span className="bill-meter-count">
          {used} / {unlimited ? "Unlimited" : limit}
        </span>
      </div>
      <div className="bill-meter-track">
        <div
          className={`bill-meter-fill${near ? " near" : ""}${
            unlimited ? " unlimited" : ""
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upgradeRef = useRef<HTMLDivElement>(null);

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
  const canUpgrade = !isPro && info.is_admin && !info.pending_request;
  const yearlySave = Math.round(
    (1 - PLANS.pro.price.year / (PLANS.pro.price.month * 12)) * 100
  );

  function priceFor(id: PlanId) {
    if (id === "free") return { amount: "$0", per: "/mo", sub: "" };
    if (interval === "year")
      return {
        amount: `$${PLANS.pro.price.year}`,
        per: "/yr",
        sub: `$${Math.round(PLANS.pro.price.year / 12)}/mo, billed annually`,
      };
    return { amount: `$${PLANS.pro.price.month}`, per: "/mo", sub: "" };
  }

  return (
    <div className="pv billing-pv">
      {error && <p className="invite-err">{error}</p>}

      {/* Current plan */}
      <div className="bill-hero">
        <div>
          <div className="bill-hero-label">Current plan</div>
          <div className="bill-hero-row">
            <span className={`bill-badge bill-badge-${info.plan}`}>
              {PLANS[info.plan].name}
            </span>
            {isPro && info.interval && (
              <span className="bill-hero-cycle">Billed {info.interval}ly</span>
            )}
          </div>
        </div>
        {isPro && info.current_period_end && (
          <div className="bill-hero-renew">
            <span>Renews</span>
            <strong>{fmtDate(info.current_period_end)}</strong>
          </div>
        )}
      </div>

      <div className="bill-meters">
        <UsageMeter
          label="Projects"
          used={info.usage.projects}
          limit={info.limits.projects}
        />
        <UsageMeter
          label="Members"
          used={info.usage.members}
          limit={info.limits.members}
        />
      </div>

      {/* Billing period toggle */}
      {canUpgrade && (
        <div className="bill-toggle">
          <button
            type="button"
            className={interval === "month" ? "active" : ""}
            onClick={() => setInterval("month")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={interval === "year" ? "active" : ""}
            onClick={() => setInterval("year")}
          >
            Yearly
            <span className="bill-save">Save {yearlySave}%</span>
          </button>
        </div>
      )}

      {/* Plan cards */}
      <div className="bill-plans">
        {(Object.keys(PLANS) as PlanId[]).map((id) => {
          const plan = PLANS[id];
          const current = info.plan === id;
          const featured = id === "pro";
          const p = priceFor(id);
          return (
            <div
              key={id}
              className={`bill-card${featured ? " featured" : ""}${
                current ? " current" : ""
              }`}
            >
              {featured && <span className="bill-card-tag">Recommended</span>}
              <div className="bill-card-name">{plan.name}</div>
              <div className="bill-card-price">
                <span className="bill-amount">{p.amount}</span>
                <span className="bill-per">{p.per}</span>
              </div>
              <div className="bill-card-sub">{p.sub || " "}</div>
              <ul className="bill-features">
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="bill-card-cta">
                {current ? (
                  <button className="btn bill-btn" disabled>
                    Current plan
                  </button>
                ) : featured && canUpgrade ? (
                  <button
                    className="btn btn-primary bill-btn"
                    onClick={() =>
                      upgradeRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    Upgrade to Pro
                  </button>
                ) : featured && info.pending_request ? (
                  <button className="btn bill-btn" disabled>
                    Upgrade pending
                  </button>
                ) : featured && !info.is_admin ? (
                  <button className="btn bill-btn" disabled>
                    Admins only
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upgrade flow / states */}
      {isPro ? (
        <div className="bill-note">
          You&apos;re on <strong>Pro</strong> — thank you! To renew or change your
          plan, contact{" "}
          {info.contact.email ? <strong>{info.contact.email}</strong> : "us"}.
        </div>
      ) : !info.is_admin ? (
        <div className="bill-note">
          Only workspace admins can change the plan.
        </div>
      ) : info.pending_request ? (
        <div className="bill-pending">
          <span className="bill-pending-ic" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <div>
            <strong>Upgrade request received.</strong> We&apos;ll activate Pro (
            {info.pending_request.interval}ly) once we&apos;ve verified your bank
            transfer. Make sure you&apos;ve emailed your invoice and workspace
            domain to {info.contact.email || "us"}.
          </div>
        </div>
      ) : (
        <div className="bill-upgrade" ref={upgradeRef}>
          <div className="bill-upgrade-head">
            <h2>Upgrade to Pro by bank transfer</h2>
            <span className="bill-upgrade-amount">
              ${amount}
              <span>/{interval === "year" ? "yr" : "mo"}</span>
            </span>
          </div>
          <ol className="bill-steps">
            <li>
              <span className="bill-step-n">1</span>
              <span>
                Transfer <strong>${amount}</strong> to the account below.
              </span>
            </li>
            <li>
              <span className="bill-step-n">2</span>
              <span>
                Email your payment invoice and workspace domain{" "}
                <code className="bill-domain">{info.workspace.subdomain}</code>{" "}
                to{" "}
                {info.contact.email ? (
                  <strong>{info.contact.email}</strong>
                ) : (
                  "our billing contact"
                )}
                .
              </span>
            </li>
            <li>
              <span className="bill-step-n">3</span>
              <span>Click the button below so we know to expect it.</span>
            </li>
          </ol>

          {bankLines.length > 0 ? (
            <div className="bill-bank">
              {bankLines.map((f) => (
                <div key={f.key} className="bill-bank-row">
                  <span className="bill-bank-k">{f.label}</span>
                  <span className="bill-bank-v">{info.contact.bank[f.key]}</span>
                </div>
              ))}
            </div>
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
