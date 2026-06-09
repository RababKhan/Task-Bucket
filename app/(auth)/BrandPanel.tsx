import Logo from "@/components/Logo";

type Variant = "signup" | "login" | "forgot";

const FOOTERS: Record<Variant, string> = {
  signup: "No setup headaches.",
  login: "Pick up right where you left off.",
  forgot: "Back to shipping in no time.",
};

// Shared left-hand marketing panel. Each auth page passes a `variant` so the
// copy is tailored to that flow while the framing (logo, layout, footer) stays
// consistent — both pages feel like one product. The signup variant also takes
// the live wizard `step` so its checklist tracks the user's progress.
export default function BrandPanel({
  variant = "signup",
  step = 1,
}: {
  variant?: Variant;
  step?: number;
}) {
  return (
    <aside className="signup-brand-panel">
      <div className="signup-brand-top">
        <Logo className="signup-brand-logo" />
      </div>

      <div className="signup-brand-mid">
        {variant === "login" && <LoginContent />}
        {variant === "signup" && <SignupContent step={step} />}
        {variant === "forgot" && <ForgotContent />}
      </div>

      <p className="signup-brand-foot">{FOOTERS[variant]}</p>
    </aside>
  );
}

function ForgotContent() {
  return (
    <>
      <h2 className="signup-brand-h">
        Locked out?
        <br />
        No problem.
      </h2>
      <p className="signup-brand-p">
        We&apos;ll get you back into your workspace in a moment.
      </p>
      <ul className="signup-features">
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l7 3v5c0 4.2-2.8 7.5-7 8.5-4.2-1-7-4.3-7-8.5V6l7-3z" />
            <path d="M9.5 12l2 2 3.5-3.5" />
          </svg>
          Codes expire in 1 minute
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
          Check spam if it&apos;s slow to arrive
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Your data stays secure
        </li>
      </ul>
    </>
  );
}

const SIGNUP_STEPS = [
  "Enter your email",
  "Verify with a code",
  "Set up your workspace",
];

function SignupContent({ step }: { step: number }) {
  return (
    <>
      <h2 className="signup-brand-h">Set up in minutes.</h2>
      <p className="signup-brand-p">Three quick steps to your new workspace.</p>
      <ol className="brand-steps">
        {SIGNUP_STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          return (
            <li key={n} className={`brand-step ${state}`}>
              <span className="brand-step-num">
                {state === "done" ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12l4 4 10-10" />
                  </svg>
                ) : (
                  n
                )}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function LoginContent() {
  return (
    <>
      <h2 className="signup-brand-h">Plan, track, ship.</h2>
      <p className="signup-brand-p">
        Everything your team needs to move fast.
      </p>
      <ul className="signup-features">
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
            <path d="M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z" />
          </svg>
          Kanban task boards
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
            <path d="M12 7a5 5 0 1 0 5 5" />
            <path d="M13 3.055a9 9 0 1 0 7.941 7.945" />
            <path d="M15 6v3h3l3 -3h-3v-3z" />
            <path d="M15 9l-3 3" />
          </svg>
          Sprints from start to finish
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" />
            <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
          </svg>
          One place for every update
        </li>
      </ul>
    </>
  );
}
