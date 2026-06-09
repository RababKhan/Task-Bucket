import NextAuth from "next-auth";
import authConfig from "@/auth.config";

// Edge-safe auth instance (no DB) used purely for route protection.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except NextAuth's own routes, the public auth APIs,
  // Next internals, and static assets.
  matcher: [
    "/((?!api/auth|api/register|api/password|api/signup|api/workspace/check|_next/static|_next/image|favicon.ico).*)",
  ],
};
