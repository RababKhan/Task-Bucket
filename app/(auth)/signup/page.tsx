import Link from "next/link";
import { githubEnabled, googleEnabled } from "@/auth.config";
import SignupForm from "./SignupForm";
import Logo from "@/components/Logo";

export default function SignupPage() {
  return (
    <div className="auth-wrap">
      <div className="signup-card">
        {/* Left: brand / marketing panel */}
        <aside className="signup-brand-panel">
          <Logo className="signup-brand-logo" />

          <div className="signup-brand-mid">
            <h2 className="signup-brand-h">
              Plan projects.
              <br />
              Ship faster.
            </h2>
            <p className="signup-brand-p">
              Projects, tasks, and boards built for focused teams.
            </p>
            <ul className="signup-features">
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="7" height="18" rx="1.5" />
                  <rect x="14" y="3" width="7" height="11" rx="1.5" />
                </svg>
                Kanban task boards
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 2 2 7l10 5 10-5-10-5Z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                Projects &amp; workspaces
              </li>
              <li>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 1A11 11 0 0 0 8.52 22.45c.55.1.75-.24.75-.53v-1.85c-3.06.67-3.7-1.47-3.7-1.47-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.69 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.47-2.44-.28-5.01-1.22-5.01-5.44 0-1.2.43-2.18 1.13-2.95-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.4 10.4 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.75 1.13 2.95 0 4.23-2.58 5.16-5.03 5.43.4.34.74 1 .74 2.03v3c0 .3.2.64.76.53A11 11 0 0 0 12 1Z" />
                </svg>
                GitHub-native sign-in
              </li>
            </ul>
          </div>

          <p className="signup-brand-foot">Trusted by fast-moving teams.</p>
        </aside>

        {/* Right: the signup wizard */}
        <div className="signup-form-panel">
          <p className="signup-topright">
            Already have an account?{" "}
            <Link href="/login" className="signup-cta-link">
              Sign in
            </Link>
          </p>
          <div className="signup-form-center">
            <SignupForm
              githubEnabled={githubEnabled}
              googleEnabled={googleEnabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
