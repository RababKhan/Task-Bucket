"use client";

import { PASSWORD_RULES } from "@/lib/password";
import { CheckIcon } from "@/components/StatusIcon";

// Short labels for the inline checklist (the full labels live on the rules
// themselves and are reused for server-side error messages).
const SHORT_LABELS: Record<string, string> = {
  len: "8+ characters",
  upper: "uppercase",
  lower: "lowercase",
  number: "number",
};

export default function PasswordStrength({ password }: { password: string }) {
  const met = PASSWORD_RULES.map((rule) => rule.test(password));
  const count = password ? met.filter(Boolean).length : 0;

  return (
    <div className="pw-strength" aria-live="polite">
      <div className="pw-bars">
        {PASSWORD_RULES.map((_, i) => (
          <span key={i} className="pw-bar">
            <span
              className={`pw-bar-fill ${i < count ? "active" : ""}`}
              style={{ transitionDelay: `${i * 60}ms` }}
            />
          </span>
        ))}
      </div>

      <ul className="pw-rules">
        {PASSWORD_RULES.map((rule, i) => (
          <li key={rule.id} className={met[i] ? "ok" : ""}>
            {met[i] ? (
              <CheckIcon className="rule-ic" />
            ) : (
              <span className="rule-dot" />
            )}
            {SHORT_LABELS[rule.id] ?? rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
