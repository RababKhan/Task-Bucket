// Client-safe form validators. Each returns an error message, or "" if valid.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string {
  const v = value.trim();
  if (!v) return "Please enter your email address.";
  if (!EMAIL_RE.test(v)) return "Please enter a valid email address.";
  return "";
}

export function requireValue(value: string, message: string): string {
  return value.trim() ? "" : message;
}
