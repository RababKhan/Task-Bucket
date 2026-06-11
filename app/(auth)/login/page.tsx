import { Suspense } from "react";
import Link from "next/link";
import { githubEnabled, googleEnabled } from "@/auth.config";
import OAuthButtons from "../OAuthButtons";
import BrandPanel from "../BrandPanel";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <div className="signup-card">
        {/* Left: brand / marketing panel */}
        <BrandPanel variant="login" />

        {/* Right: the sign-in form */}
        <div className="signup-form-panel">
          <p className="signup-topright">
            New here?{" "}
            <Link href="/signup" className="signup-cta-link">
              Sign up
            </Link>
          </p>
          <div className="signup-form-center">
            <div className="signup-wizard">
              <h1 className="signup-h">Welcome Back</h1>
              <p className="signup-sub">Sign in to your workspace.</p>

              {(githubEnabled || googleEnabled) && (
                <OAuthButtons
                  github={githubEnabled}
                  google={googleEnabled}
                  label="Sign in"
                />
              )}

              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
