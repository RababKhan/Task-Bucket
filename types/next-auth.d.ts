import { DefaultSession } from "next-auth";
import type { Role } from "@/lib/types";

type WorkspaceClaim = {
  name: string;
  subdomain: string;
  // Was hardcoded to "admin" | "manager" | "assignee" — missing "owner" here
  // (a real value ever since scripts/migrate-owner-role.mjs) is what let a
  // string of `role === "admin"` checks across the app compile cleanly while
  // silently excluding Owner accounts. Role (lib/types.ts) is the real,
  // complete set.
  role: Role;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    workspace?: WorkspaceClaim;
    is_superadmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    ws?: WorkspaceClaim;
    super?: boolean;
  }
}
