// Shared password rules + strength scoring. Pure functions — safe to import
// from both client components and server route handlers.

export type PasswordRule = {
  id: string;
  label: string;
  test: (pw: string) => boolean;
};

// Hard requirements: every account password must satisfy all of these.
export const PASSWORD_RULES: PasswordRule[] = [
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "number", label: "A number", test: (p) => /[0-9]/.test(p) },
];

export function passwordRuleFailures(pw: string): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
}

export function passwordMeetsRules(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

// 0 = Weak, 1 = Moderate, 2 = Strong.
export type StrengthTier = 0 | 1 | 2;

export type Strength = {
  tier: StrengthTier;
  label: string;
};

const TIER_LABELS = ["Weak", "Moderate", "Strong"];

// Three-tier strength estimate, anchored to the baseline rules so the meter
// tracks the rules checklist:
//   Weak     — baseline rules not yet met
//   Moderate — baseline rules met (8+, upper, lower, number)
//   Strong   — baseline rules met, plus a symbol (one step beyond required)
export function passwordStrength(pw: string): Strength {
  if (!pw) return { tier: 0, label: "" };

  if (!passwordMeetsRules(pw)) return { tier: 0, label: TIER_LABELS[0] };

  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const tier: StrengthTier = hasSymbol ? 2 : 1;
  return { tier, label: TIER_LABELS[tier] };
}
