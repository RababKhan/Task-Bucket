import { Suspense } from "react";
import ResetForm from "./ResetForm";
import Logo from "@/components/Logo";

export default function ResetPasswordPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
        </div>
        <p className="auth-title">Choose a New Password</p>
        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
