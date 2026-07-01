import { readFileSync } from "node:fs";

// Shared constants for the E2E suite — seeded by global.setup.ts and referenced
// by specs. Two workspaces exercise multi-tenant isolation.

// IDs written by the seed step, read by specs that need to hit specific
// projects/users (e.g. cross-tenant URL/API checks).
export type SeedInfo = {
  users: Record<string, string>;
  workspaces: Record<string, string>;
  projects: Record<string, number>;
};
export function readSeed(): SeedInfo {
  return JSON.parse(readFileSync("tests/e2e/.auth/seed.json", "utf8"));
}

export const PASSWORD = "Password123!";

export const WS = {
  acme: { key: "acme", name: "Acme Inc", subdomain: "acme-e2e" },
  globex: { key: "globex", name: "Globex", subdomain: "globex-e2e" },
} as const;

export const USERS = {
  admin: {
    email: "admin@e2e.test",
    name: "Ada Admin",
    role: "admin" as const,
    ws: "acme" as const,
    owner: true,
  },
  manager: {
    email: "manager@e2e.test",
    name: "Max Manager",
    role: "manager" as const,
    ws: "acme" as const,
    owner: false,
  },
  member: {
    email: "member@e2e.test",
    name: "Mia Member",
    role: "assignee" as const,
    ws: "acme" as const,
    owner: false,
  },
  other: {
    email: "other@e2e.test",
    name: "Otto Other",
    role: "admin" as const,
    ws: "globex" as const,
    owner: true,
  },
} as const;

export type RoleKey = keyof typeof USERS;

// storageState files written by the setup project, one per user.
export const authFile = (role: RoleKey) => `tests/e2e/.auth/${role}.json`;

// Seeded projects. `Alpha` is where the member has access; `Zeta` is in the
// other workspace (used for cross-tenant isolation tests).
export const PROJECTS = {
  alpha: { name: "Alpha Project", ws: "acme" as const },
  beta: { name: "Beta Project", ws: "acme" as const },
  zeta: { name: "Zeta Project", ws: "globex" as const },
} as const;
