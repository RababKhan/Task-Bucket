// Thin fetch helpers shared by every TanStack Query hook + mutation.
// Keep the same endpoints/payloads the app already uses — this only
// centralises JSON parsing and error handling.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function parse(res: Response) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : null) || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  return data;
}

export function apiGet<T = unknown>(url: string): Promise<T> {
  return fetch(url).then(parse) as Promise<T>;
}

type Body = Record<string, unknown> | unknown[] | undefined;

function send<T = unknown>(method: string, url: string, body?: Body): Promise<T> {
  return fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(parse) as Promise<T>;
}

export const apiPost = <T = unknown>(url: string, body?: Body) =>
  send<T>("POST", url, body);
export const apiPatch = <T = unknown>(url: string, body?: Body) =>
  send<T>("PATCH", url, body);
export const apiPut = <T = unknown>(url: string, body?: Body) =>
  send<T>("PUT", url, body);
export const apiDelete = <T = unknown>(url: string, body?: Body) =>
  send<T>("DELETE", url, body);
