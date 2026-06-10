import { NextResponse } from "next/server";
import { createCredentialsUser, getUserByEmail } from "@/lib/auth-db";
import { passwordMeetsRules, passwordRuleFailures } from "@/lib/password";
import {
  validateSubdomain,
  isSubdomainAvailable,
  createWorkspace,
} from "@/lib/workspace";
import { isSignupVerified, clearSignupOtp } from "@/lib/signup-otp";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const workspaceName = String(body.workspaceName ?? "").trim();
  const subdomain = String(body.subdomain ?? "").trim().toLowerCase();
  const verifyToken = String(body.verifyToken ?? "");

  // ---- Validation ----
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address.", field: "email" },
      { status: 400 }
    );
  }
  // Email must have been verified earlier in the signup wizard.
  if (!(await isSignupVerified(email, verifyToken))) {
    return NextResponse.json(
      { error: "Your email verification has expired. Please start over." },
      { status: 400 }
    );
  }
  if (!passwordMeetsRules(password)) {
    return NextResponse.json(
      {
        error: `Password is missing: ${passwordRuleFailures(password).join(", ")}.`,
        field: "password",
      },
      { status: 400 }
    );
  }
  if (!workspaceName) {
    return NextResponse.json(
      { error: "Workspace name is required.", field: "workspaceName" },
      { status: 400 }
    );
  }
  const subError = validateSubdomain(subdomain);
  if (subError) {
    return NextResponse.json(
      { error: subError, field: "subdomain" },
      { status: 400 }
    );
  }

  // ---- Uniqueness ----
  if (await getUserByEmail(email)) {
    return NextResponse.json(
      {
        error:
          "An account with this email already exists. Try signing in, or reset your password.",
        field: "email",
      },
      { status: 409 }
    );
  }
  if (!(await isSubdomainAvailable(subdomain))) {
    return NextResponse.json(
      { error: "That subdomain is already taken.", field: "subdomain" },
      { status: 409 }
    );
  }

  // ---- Create user + workspace ----
  // If the workspace insert fails, the user still gets one auto-provisioned on
  // their first sign-in (see ensureWorkspaceForUser), so this is safe to do
  // sequentially without a wrapping transaction.
  try {
    const user = await createCredentialsUser(email, password, name);
    await createWorkspace(user.id, workspaceName, subdomain);
    await clearSignupOtp(email);
  } catch (err) {
    console.error("[register] failed:", err);
    return NextResponse.json(
      { error: "Could not create account. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
