import Link from "next/link";
import { githubEnabled, googleEnabled } from "@/auth.config";
import OAuthButtons from "../OAuthButtons";
import LoginForm from "./LoginForm";
import Logo from "@/components/Logo";

export default function LoginPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
        </div>
        <p className="auth-title">Sign in to Task Bucket</p>

        <OAuthButtons github={githubEnabled} google={googleEnabled} label="Sign in" />
        <LoginForm />

        <div className="signup-cta">
          <span className="signup-cta-prompt">New to Task Bucket?</span>{" "}
          <Link href="/signup" className="signup-cta-link">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
