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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        if (!user || !user.password_hash) return null;
        if (!verifyPassword(password, user.password_hash)) return null;

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
        token.picture = dbUser.image;
      } else if (user) {
        // Credentials sign-in: user.id is already our internal id.
        token.uid = user.id;
      }

      // On an explicit session.update() (e.g. after editing the profile),
      // re-read the user's latest name/email/image from the DB.
      if (trigger === "update" && token.uid) {
        const u = await getUserById(token.uid as string);
        if (u) {
          token.name = u.name;
          token.email = u.email;
          token.picture = u.image;
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
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        session.user.id = token.uid as string;
      }
      if (token.ws) {
        session.workspace = token.ws as {
          name: string;
          subdomain: string;
          role: "admin" | "manager" | "assignee";
        };
      }
      return session;
    },
  },
});
