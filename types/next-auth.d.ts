import { DefaultSession } from "next-auth";

type WorkspaceClaim = {
  name: string;
  subdomain: string;
  role: "admin" | "manager" | "assignee";
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
    workspace?: WorkspaceClaim;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    ws?: WorkspaceClaim;
  }
}
