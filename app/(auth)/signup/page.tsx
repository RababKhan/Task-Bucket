import { githubEnabled, googleEnabled } from "@/auth.config";
import SignupExperience from "./SignupExperience";

export default function SignupPage() {
  return (
    <div className="auth-wrap">
      <SignupExperience
        githubEnabled={githubEnabled}
        googleEnabled={googleEnabled}
      />
    </div>
  );
}
