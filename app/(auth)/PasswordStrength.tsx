"use client";

import { PASSWORD_RULES, passwordStrength } from "@/lib/password";
import { CheckIcon } from "@/components/StatusIcon";

// Weak / Moderate / Strong
const TIER_COLORS = ["#e5484d", "#d9a441", "#16A34A"];

export default function PasswordStrength({ password }: { password: string }) {
  const { tier, label } = passwordStrength(password);
  const color = password ? TIER_COLORS[tier] : undefined;
  const secure = !!password && tier >= 2;

  return (
    <div className="pw-strength" aria-live="polite">
      <div className="pw-meter">
        <div
          className={`pw-shield ${secure ? "secure" : ""}`}
          style={{ color }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 5v6c0 5 3.4 8.3 8 10 4.6-1.7 8-5 8-10V5l-8-3Z" />
            <path className="pw-check" d="M9 12l2 2 4-4" />
          </svg>
        </div>

        <div className="pw-bars">
          {[0, 1, 2].map((i) => {
            const active = !!password && i <= tier;
            return (
              <span key={i} className="pw-bar">
                <span
                  className={`pw-bar-fill ${active ? "active" : ""}`}
                  style={{ background: color, transitionDelay: `${i * 60}ms` }}
                />
              </span>
            );
          })}
        </div>

        <span className="pw-label" style={{ color }}>
          {password ? label : ""}
        </span>
      </div>

      <ul className="pw-rules">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} className={ok ? "ok" : ""}>
              {ok ? <CheckIcon className="rule-ic" /> : <span className="rule-dot" />}
              {rule.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
