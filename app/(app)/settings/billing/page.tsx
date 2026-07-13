"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Spinner from "@/components/Spinner";
import {
  PLANS,
  PLAN_FEATURES,
  fmtPrice,
  type PlanId,
  type BillingInterval,
} from "@/lib/plans";

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
  usage: {
    projects: number;
    members: number;
    tasks_by_project: { id: number; name: string; tasks: number }[];
    storage_bytes: number;
  };
  limits: {
    projects: number | null;
    members: number | null;
    storage: number | null;
    tasksPerProject: number | null;
  };
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

// "05 April, 2026" — matches the subscription-history table style.
function fmtDateLong(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${day} ${month}, ${d.getUTCFullYear()}`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// null limit = unlimited.
function pctOf(used: number, limit: number | null): number {
  if (limit == null) return 100;
  return Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
}
function nearOf(used: number, limit: number | null): boolean {
  return limit != null && limit > 0 && used / limit >= 0.8;
}

type HistoryRow = {
  interval: string | null;
  created_at: string;
  resolved_at: string | null;
};

const UsageIcon = {
  projects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  members: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  storage: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
};

function UsageRow({
  icon,
  label,
  used,
  limit,
  pct,
  unlimited,
  near,
}: {
  icon: ReactNode;
  label: string;
  used: string;
  limit: string;
  pct: number;
  unlimited?: boolean;
  near?: boolean;
}) {
  return (
    <div className="bill-usage-row">
      <div className="bill-usage-row-head">
        <span className="bill-usage-ic">{icon}</span>
        <span className="bill-usage-name">{label}</span>
      </div>
      <div className="bill-usage-track">
        <div
          className={`bill-usage-fill${near ? " near" : ""}${
            unlimited ? " unlimited" : ""
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="bill-usage-nums">
        <span>{used}</span>
        <span>{limit}</span>
      </div>
    </div>
  );
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

function Cross() {
  return (
    <svg className="bill-cross" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export default function BillingPage() {
  const [info, setInfo] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [paySelected, setPaySelected] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    if (res.ok) setInfo(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openHistory() {
    setHistoryOpen(true);
    if (history) return; // already fetched
    const res = await fetch("/api/billing/history");
    if (res.ok) {
      const d = await res.json();
      setHistory(d.history as HistoryRow[]);
    } else {
      setHistory([]);
    }
  }

  // Close whichever modal is open on Escape.
  useEffect(() => {
    if (!upgradeOpen && !historyOpen && !usageOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setUpgradeOpen(false);
      setHistoryOpen(false);
      setUsageOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [upgradeOpen, historyOpen, usageOpen]);

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
    setUpgradeOpen(false);
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
    if (id === "free") return { amount: fmtPrice(0), per: "/mo", sub: "" };
    if (interval === "year")
      return {
        amount: fmtPrice(PLANS.pro.price.year),
        per: "/yr",
        sub: "",
      };
    return { amount: fmtPrice(PLANS.pro.price.month), per: "/mo", sub: "" };
  }

  const subPeriod = isPro
    ? info.interval === "year"
      ? "Yearly"
      : "Monthly"
    : "—";
  const subRenewal = isPro
    ? info.current_period_end
      ? fmtDate(info.current_period_end)
      : "No expiry"
    : "—";
  const subAmount = isPro
    ? fmtPrice(PLANS.pro.price[info.interval === "year" ? "year" : "month"])
    : fmtPrice(0);

  return (
    <div className="pv billing-pv">
      {error && <p className="invite-err">{error}</p>}

      {/* Current subscription details */}
      <div className="bill-sub">
        <h2 className="bill-sub-title">Current Subscription details</h2>

        <div className="bill-sub-plan">
          <div className="bill-sub-label">Plan Name</div>
          <div className="bill-sub-plan-row">
            <span className="bill-sub-plan-name">{PLANS[info.plan].name}</span>
            <button
              type="button"
              className="bill-usage-dots"
              onClick={() => setUsageOpen(true)}
              data-tip="View usage"
              aria-label="View usage"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="12" cy="19" r="1.6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Period / renewal / amount only apply once a plan is purchased. */}
        {isPro && (
          <>
            <div className="bill-sub-divider" />

            <div className="bill-sub-grid">
              <div className="bill-sub-col">
                <div className="bill-sub-col-label">Plan Period</div>
                <div className="bill-sub-col-value">{subPeriod}</div>
              </div>
              <div className="bill-sub-col">
                <div className="bill-sub-col-label">Renewal Date</div>
                <div className="bill-sub-col-value">{subRenewal}</div>
              </div>
              <div className="bill-sub-col">
                <div className="bill-sub-col-label">Renewal Amount</div>
                <div className="bill-sub-col-value">{subAmount}</div>
              </div>
            </div>

            <div className="bill-sub-divider" />
            <button
              type="button"
              className="bill-history-link"
              onClick={openHistory}
            >
              View Subscription History
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        )}
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
              <div className="bill-card-cta">
                {current ? (
                  <button className="btn bill-btn" disabled>
                    Current plan
                  </button>
                ) : featured && canUpgrade ? (
                  <button
                    className="btn btn-primary bill-btn"
                    onClick={() => {
                      setPaySelected(false);
                      setUpgradeOpen(true);
                    }}
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
              <div className="bill-card-includes">This plan includes</div>
              <ul className="bill-features">
                {PLAN_FEATURES.map((feat) => {
                  const val = feat[id];
                  const included = val !== false;
                  return (
                    <li
                      key={feat.label}
                      className={included ? "" : "bill-feature-off"}
                    >
                      <span
                        className={`bill-feat-ic${included ? "" : " off"}`}
                      >
                        {included ? <Check /> : <Cross />}
                      </span>
                      {included ? val : feat.label}
                    </li>
                  );
                })}
              </ul>
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
      ) : null}

      {/* Upgrade-by-bank-transfer modal (opened from the Pro card CTA) */}
      {upgradeOpen && canUpgrade && (
        <div
          className="overlay"
          onMouseDown={() => !busy && setUpgradeOpen(false)}
        >
          <div
            className="modal bill-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Left: payment method + instructions */}
            <div className="bill-modal-main">
              <h2 className="bill-co-h1">Let&apos;s complete the payment process!</h2>

              <h3 className="bill-co-h2">Select Payment Method</h3>
              <button
                type="button"
                className={`bill-pay-method${paySelected ? " selected" : ""}`}
                onClick={() => setPaySelected(true)}
              >
                <span className="bill-pay-ic" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" />
                    <path d="M5 21V10l7-5 7 5v11" />
                    <path d="M9 21v-6h6v6" />
                  </svg>
                </span>
                <span className="bill-pay-name">Bank Payment</span>
                {paySelected && (
                  <span className="bill-pay-check" aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                )}
              </button>

              {paySelected && (
                <div className="bill-instr">
                  <h4 className="bill-instr-h">Manual Banking Instruction</h4>
                  {bankLines.length > 0 ? (
                    <div className="bill-instr-body">
                      <p className="bill-instr-sub">Bank transfer details</p>
                      <ul>
                        {bankLines.map((f) => (
                          <li key={f.key}>
                            <strong>{f.label}:</strong>{" "}
                            {info.contact.bank[f.key]}
                          </li>
                        ))}
                      </ul>
                      <p className="bill-instr-note">
                        Please send payment within 3 business days and email your
                        invoice with workspace domain{" "}
                        <code className="bill-domain">
                          {info.workspace.subdomain}
                        </code>{" "}
                        to{" "}
                        {info.contact.email ? (
                          <strong>{info.contact.email}</strong>
                        ) : (
                          "our billing contact"
                        )}{" "}
                        once complete.
                      </p>
                    </div>
                  ) : (
                    <p className="invite-err">
                      Bank details aren&apos;t configured yet. See BILLING.md.
                    </p>
                  )}
                </div>
              )}

              <div className="bill-co-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setUpgradeOpen(false)}
                  disabled={busy}
                >
                  Back
                </button>
                {paySelected && bankLines.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={requestUpgrade}
                    disabled={busy}
                  >
                    {busy ? <Spinner /> : "I've made the transfer"}
                  </button>
                )}
              </div>
            </div>

            {/* Right: order summary */}
            <aside className="bill-modal-summary">
              <h3 className="bill-sum-title">Order Summary</h3>

              <div className="bill-sum-plan-block">
                <div className="bill-sum-plan">Pro</div>
                <div className="bill-sum-cycle">
                  {interval === "year" ? "Yearly billing" : "Monthly billing"}
                </div>
              </div>

              <div className="bill-sum-row">
                <span>Pro ({interval === "year" ? "Yearly" : "Monthly"})</span>
                <span>{fmtPrice(amount)}</span>
              </div>
              {interval === "year" && (
                <div className="bill-sum-row bill-sum-muted">
                  <span>Effective monthly</span>
                  <span>{fmtPrice(Math.round(amount / 12))}/mo</span>
                </div>
              )}

              <div className="bill-sum-divider" />

              <div className="bill-sum-row">
                <span>Subtotal</span>
                <span>{fmtPrice(amount)}</span>
              </div>
              <div className="bill-sum-row bill-sum-total-line">
                <span>Total</span>
                <span>{fmtPrice(amount)}</span>
              </div>

              <div className="bill-sum-divider" />

              <div className="bill-sum-total">
                <span>Total Amount</span>
                <span className="bill-sum-amount">
                  {fmtPrice(amount)}
                  <span>/{interval === "year" ? "yr" : "mo"}</span>
                </span>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* Subscription history modal (Pro only) */}
      {historyOpen && (
        <div className="overlay" onMouseDown={() => setHistoryOpen(false)}>
          <div
            className="modal bill-history-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="bill-history-head">
              <h2>Subscription History</h2>
              <button
                type="button"
                className="bill-history-x"
                onClick={() => setHistoryOpen(false)}
                data-tip="Close"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {history == null ? (
              <div className="bill-history-empty">
                <Spinner />
              </div>
            ) : history.length === 0 ? (
              <div className="bill-history-empty">
                No subscription history yet.
              </div>
            ) : (
              <div className="bill-history-table">
                <div className="bill-history-row bill-history-headrow">
                  <span>Plan Name</span>
                  <span>Plan Period</span>
                  <span>Subscription Cost</span>
                  <span>Payment Date</span>
                </div>
                {history.map((h, i) => (
                  <div key={i} className="bill-history-row">
                    <span>{PLANS.pro.name}</span>
                    <span>
                      {h.interval === "year"
                        ? "Yearly"
                        : h.interval === "month"
                          ? "Monthly"
                          : "—"}
                    </span>
                    <span>
                      {h.interval === "year"
                        ? fmtPrice(PLANS.pro.price.year)
                        : h.interval === "month"
                          ? fmtPrice(PLANS.pro.price.month)
                          : "—"}
                    </span>
                    <span>{fmtDateLong(h.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Usage modal (opened from the ⋮ next to Plan Name) */}
      {usageOpen && (
        <div className="overlay" onMouseDown={() => setUsageOpen(false)}>
          <div
            className="modal bill-usage-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="bill-usage-head">
              <h2>Usage</h2>
              <button
                type="button"
                className="bill-usage-x"
                onClick={() => setUsageOpen(false)}
                data-tip="Close"
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bill-usage-body">
              <UsageRow
                icon={UsageIcon.projects}
                label="Projects"
                used={`Created: ${info.usage.projects}`}
                limit={`Project Limit: ${info.limits.projects ?? "Unlimited"}`}
                unlimited={info.limits.projects == null}
                pct={pctOf(info.usage.projects, info.limits.projects)}
                near={nearOf(info.usage.projects, info.limits.projects)}
              />
              <UsageRow
                icon={UsageIcon.members}
                label="Team Members"
                used={`Joined: ${info.usage.members}`}
                limit={`Member Limit: ${info.limits.members ?? "Unlimited"}`}
                unlimited={info.limits.members == null}
                pct={pctOf(info.usage.members, info.limits.members)}
                near={nearOf(info.usage.members, info.limits.members)}
              />
              <UsageRow
                icon={UsageIcon.storage}
                label="Storage"
                used={`Consumed: ${fmtBytes(info.usage.storage_bytes)}`}
                limit={`Storage Limit: ${
                  info.limits.storage != null
                    ? `${info.limits.storage} GB`
                    : "Unlimited"
                }`}
                unlimited={info.limits.storage == null}
                pct={pctOf(
                  info.usage.storage_bytes,
                  info.limits.storage == null
                    ? null
                    : info.limits.storage * 1024 ** 3
                )}
                near={nearOf(
                  info.usage.storage_bytes,
                  info.limits.storage == null
                    ? null
                    : info.limits.storage * 1024 ** 3
                )}
              />
              <div className="bill-usage-row">
                <div className="bill-usage-row-head">
                  <span className="bill-usage-ic">{UsageIcon.tasks}</span>
                  <span className="bill-usage-name">Tasks</span>
                  <span className="bill-usage-cap">
                    {info.limits.tasksPerProject != null
                      ? `${info.limits.tasksPerProject} / project`
                      : "Unlimited"}
                  </span>
                </div>
                {info.usage.tasks_by_project.length === 0 ? (
                  <div className="bill-usage-empty">No projects yet.</div>
                ) : (
                  <div className="bill-usage-projects">
                    {info.usage.tasks_by_project.map((p) => {
                      const cap = info.limits.tasksPerProject;
                      return (
                        <div key={p.id} className="bill-usage-proj">
                          <div className="bill-usage-proj-top">
                            <span className="bill-usage-proj-name">
                              {p.name}
                            </span>
                            <span className="bill-usage-proj-count">
                              {p.tasks}
                              {cap != null ? ` / ${cap}` : ""}
                            </span>
                          </div>
                          <div className="bill-usage-track">
                            <div
                              className={`bill-usage-fill${
                                nearOf(p.tasks, cap) ? " near" : ""
                              }${cap == null ? " unlimited" : ""}`}
                              style={{ width: `${pctOf(p.tasks, cap)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
