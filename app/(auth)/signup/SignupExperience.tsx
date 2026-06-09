"use client";

import { useState } from "react";
import Link from "next/link";
import BrandPanel from "../BrandPanel";
import SignupForm from "./SignupForm";

// Owns the wizard step so it can be shared between the form (right) and the
// brand panel's progress checklist (left).
export default function SignupExperience({
  githubEnabled,
  googleEnabled,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  return (
    <div className="signup-card">
      {/* Left: brand / marketing panel — tracks the current step */}
      <BrandPanel variant="signup" step={step} />

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
            step={step}
            setStep={setStep}
          />
        </div>
      </div>
    </div>
  );
}
