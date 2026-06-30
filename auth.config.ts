import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

// Auth pages: reachable only when logged OUT (logged-in users get bounced to
// the app).
const AUTH_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

// Fully public pages reachable in BOTH states. Invite acceptance needs this:
// new users open it logged out, existing users open it logged in to accept.
const PUBLIC_PATHS = ["/invite"];

export const githubEnabled =
  !!process.env.AUTH_GITHUB_ID && !!process.env.AUTH_GITHUB_SECRET;
export const googleEnabled =
  !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

// Edge-safe config: no database access here so it can run in middleware.
// OAuth providers are only registered when their credentials are present.
const authConfig: NextAuthConfig = {
  providers: [
    ...(githubEnabled
      ? [
          GitHub({
            clientId: process.env.AUTH_GITHUB_ID,
            clientSecret: process.env.AUTH_GITHUB_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  // New visitors land on sign-up first; the login page stays reachable via
  // the "Sign in" link.
  pages: { signIn: "/signup" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const matches = (paths: string[]) =>
        paths.some(
          (p) => nextUrl.pathname === p || nextUrl.pathname.startsWith(p + "/")
        );

      // Fully public pages (e.g. invite acceptance) are always allowed.
      if (matches(PUBLIC_PATHS)) return true;

      if (matches(AUTH_PATHS)) {
        if (isLoggedIn) return Response.redirect(new URL("/projects", nextUrl));
        return true;
      }
      // Everything else the middleware matches is protected.
      return isLoggedIn;
    },
  },
};

export default authConfig;
