// Pure, client-safe subdomain helpers (no DB / node imports). Shared between
// the signup form (instant feedback) and the server (authoritative checks).

export const WORKSPACE_DOMAIN = "taskbucket.local";
export const SUBDOMAIN_MIN = 3;
export const SUBDOMAIN_MAX = 30;

export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "administrator", "mail", "email", "ftp",
  "localhost", "root", "help", "support", "blog", "status", "dashboard",
  "auth", "login", "logout", "signup", "register", "static", "cdn", "assets",
  "billing", "account", "settings", "internal", "test", "dev", "staging",
]);

// Returns an error message, or null if the subdomain is well-formed.
// (Does not check availability.)
export function validateSubdomain(raw: string): string | null {
  const sub = raw.trim().toLowerCase();
  if (!sub) return "Subdomain is required.";
  if (sub.length < SUBDOMAIN_MIN)
    return `Must be at least ${SUBDOMAIN_MIN} characters.`;
  if (sub.length > SUBDOMAIN_MAX)
    return `Must be ${SUBDOMAIN_MAX} characters or fewer.`;
  if (!/^[a-z0-9-]+$/.test(sub))
    return "Use only lowercase letters, numbers, and hyphens.";
  if (sub.startsWith("-") || sub.endsWith("-"))
    return "Can't start or end with a hyphen.";
  if (sub.includes("--")) return "Can't contain consecutive hyphens.";
  if (RESERVED_SUBDOMAINS.has(sub)) return "This subdomain is reserved.";
  return null;
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SUBDOMAIN_MAX);
}
