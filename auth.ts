import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "@/auth.config";
import {
  getUserByEmail,
  getUserById,
  verifyPassword,
  upsertOAuthUser,
} from "@/lib/auth-db";
import { ensureWorkspaceForUser } from "@/lib/workspace";
import { getMembership } from "@/lib/membership";
import { verifyTotp } from "@/lib/totp";
import { consumeBackupCode } from "@/lib/security-db";
import { isSuperAdminEmail } from "@/lib/owner";
import { isRateLimited, recordFailure, clientIp } from "@/lib/rate-limit";
import { avatarRef } from "@/lib/avatar";

// Sign-in throttling. Generous enough that a person fumbling their password
// never notices, tight enough that guessing is pointless: scrypt already makes
// each attempt expensive.
const SIGNIN_WINDOW_SECONDS = 900; // 15 minutes
const SIGNIN_MAX_PER_EMAIL = 10;
const SIGNIN_MAX_PER_IP = 50;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "").trim();
        const password = String(credentials?.password ?? "");
        const code = String(credentials?.code ?? "").trim();
        if (!email || !password) return null;

        // Throttle password guessing. Only failures count, so signing in often
        // costs nothing; the address and the source IP are limited separately
        // so one attacker cannot lock out an arbitrary account by guessing at
        // it (the IP limit is hit first).
        const ip = clientIp(request as Request);
        const [emailBlocked, ipBlocked] = await Promise.all([
          isRateLimited("signin:email", email, SIGNIN_MAX_PER_EMAIL, SIGNIN_WINDOW_SECONDS),
          isRateLimited("signin:ip", ip, SIGNIN_MAX_PER_IP, SIGNIN_WINDOW_SECONDS),
        ]);
        if (emailBlocked || ipBlocked) return null;

        const fail = async () => {
          await Promise.all([
            recordFailure("signin:email", email, SIGNIN_WINDOW_SECONDS),
            recordFailure("signin:ip", ip, SIGNIN_WINDOW_SECONDS),
          ]);
          return null;
        };

        const user = await getUserByEmail(email);
        if (!user || !user.password_hash) return fail();
        if (!verifyPassword(password, user.password_hash)) return fail();

        // Enforce two-factor: a valid authenticator code or a backup code.
        if (user.mfa_enabled && user.mfa_secret) {
          if (!code) return null;
          const ok =
            verifyTotp(user.mfa_secret, code) ||
            (await consumeBackupCode(user.id, code));
          if (!ok) return fail();
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile, trigger }) {
      // OAuth sign-in: upsert into our DB and use our internal user id.
      if (account && account.type === "oauth" && profile) {
        const dbUser = await upsertOAuthUser({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: (profile.email as string) ?? null,
          name:
            (profile.name as string) ??
            (profile.login as string) ??
            null,
          image:
            (profile.picture as string) ??
            (profile.avatar_url as string) ??
            null,
        });
        token.uid = dbUser.id;
        token.name = dbUser.name;
        token.email = dbUser.email;
        token.picture = avatarRef(dbUser.id, dbUser.image);
      } else if (user) {
        // Credentials sign-in: user.id is already our internal id. Normalize the
        // avatar so a data-URL image doesn't get baked into the token verbatim.
        token.uid = user.id;
        token.picture = avatarRef(user.id as string, user.image);
      }

      // On an explicit session.update(data) (e.g. after editing the profile),
      // re-read the user's latest name/email/image from the DB.
      if (trigger === "update" && token.uid) {
        const u = await getUserById(token.uid as string);
        if (u) {
          token.name = u.name;
          token.email = u.email;
          token.picture = avatarRef(token.uid as string, u.image);
        }
      }

      // At sign-in (or on update), resolve the workspace and cache it on the
      // token. OAuth sign-ups get one auto-provisioned here.
      if ((account || user || trigger === "update") && token.uid) {
        const emailLocal = ((token.email as string | null) ?? "").split("@")[0];
        const ws = await ensureWorkspaceForUser(
          token.uid as string,
          (token.name as string | null) ?? null,
          emailLocal || null
        );
        const m = await getMembership(token.uid as string);
        token.ws = {
          name: ws.name,
          subdomain: ws.subdomain,
          role: m?.role ?? "admin",
        };
      }
      // Platform-owner flag, recomputed from the current email on every pass.
      token.super = isSuperAdminEmail((token.email as string | null) ?? null);
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
        session.user.image = (token.picture as string | null) ?? null;
      }
      if (token.ws) {
        session.workspace = token.ws as {
          name: string;
          subdomain: string;
          role: "admin" | "manager" | "assignee";
        };
      }
      session.is_superadmin = Boolean(token.super);
      return session;
    },
  },
});
