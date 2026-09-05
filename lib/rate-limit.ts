import "server-only";
import { dbGet } from "@/lib/db";

// Fixed-window rate limiting backed by Postgres.
//
// The unauthenticated endpoints that send email (signup codes, password resets)
// are otherwise free to call in a loop, which burns the mail quota and lets the
// app be used to spam a third party's inbox. Redis would be the usual home for
// this, but at this size a single upsert against a table we already have is
// cheaper to run and one less service to operate.

export type RateLimitResult = {
  allowed: boolean;
  hits: number;
  limit: number;
  retryAfterSeconds: number;
};

/**
 * Count one hit against `bucket`/`subject` and report whether it is allowed.
 *
 * The window is fixed: the first hit stamps `window_start`, and the counter
 * resets on the first hit after the window elapses. Slightly permissive at
 * window boundaries compared to a sliding window, which is fine here — the goal
 * is to stop loops and scripted abuse, not to meter precisely.
 */
export async function checkRateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = subject.trim().toLowerCase().slice(0, 200);
  if (!key) {
    return { allowed: true, hits: 0, limit, retryAfterSeconds: 0 };
  }

  // One statement: reset the window if it has elapsed, otherwise increment.
  const row = await dbGet<{ hits: number; age_seconds: number }>(
    `INSERT INTO rate_limits (bucket, subject, hits, window_start)
     VALUES (?, ?, 1, to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS'))
     ON CONFLICT (bucket, subject) DO UPDATE SET
       hits = CASE
         WHEN (to_timestamp(rate_limits.window_start, 'YYYY-MM-DD HH24:MI:SS')
               < (now() AT TIME ZONE 'UTC') - make_interval(secs => ?))
         THEN 1 ELSE rate_limits.hits + 1 END,
       window_start = CASE
         WHEN (to_timestamp(rate_limits.window_start, 'YYYY-MM-DD HH24:MI:SS')
               < (now() AT TIME ZONE 'UTC') - make_interval(secs => ?))
         THEN to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS')
         ELSE rate_limits.window_start END
     RETURNING hits,
       EXTRACT(EPOCH FROM ((now() AT TIME ZONE 'UTC')
         - to_timestamp(window_start, 'YYYY-MM-DD HH24:MI:SS')))::int AS age_seconds`,
    [bucket, key, windowSeconds, windowSeconds]
  );

  const hits = row?.hits ?? 1;
  const age = row?.age_seconds ?? 0;
  return {
    allowed: hits <= limit,
    hits,
    limit,
    retryAfterSeconds: Math.max(1, windowSeconds - age),
  };
}

/**
 * Read the current count without recording a hit.
 *
 * Sign-in uses this so that only *failed* attempts count against the limit —
 * incrementing on every call would lock out someone who simply signs in a lot.
 */
export async function isRateLimited(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const key = subject.trim().toLowerCase().slice(0, 200);
  if (!key) return false;

  const row = await dbGet<{ hits: number }>(
    `SELECT hits FROM rate_limits
      WHERE bucket = ? AND subject = ?
        AND to_timestamp(window_start, 'YYYY-MM-DD HH24:MI:SS')
            >= (now() AT TIME ZONE 'UTC') - make_interval(secs => ?)`,
    [bucket, key, windowSeconds]
  );
  return (row?.hits ?? 0) >= limit;
}

/** Record one failed attempt. Errors are swallowed: a limiter that is down
 *  must not take authentication down with it. */
export async function recordFailure(
  bucket: string,
  subject: string,
  windowSeconds: number
): Promise<void> {
  try {
    await checkRateLimit(bucket, subject, Number.MAX_SAFE_INTEGER, windowSeconds);
  } catch {
    // Ignore.
  }
}
/**
 * Best-effort client IP. Trusts the proxy headers a load balancer sets — behind
 * one, `x-forwarded-for`'s first entry is the caller.
 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Apply the per-email and per-IP limits an email-sending endpoint needs.
 * Returns a Response to send back, or null when the caller may proceed.
 */
export async function limitEmailEndpoint(
  bucket: string,
  email: string,
  request: Request,
  opts: { perEmail?: number; perIp?: number; windowSeconds?: number } = {}
): Promise<Response | null> {
  const windowSeconds = opts.windowSeconds ?? 3600;
  const perEmail = opts.perEmail ?? 5;
  const perIp = opts.perIp ?? 20;

  const byEmail = await checkRateLimit(`${bucket}:email`, email, perEmail, windowSeconds);
  const byIp = await checkRateLimit(`${bucket}:ip`, clientIp(request), perIp, windowSeconds);
  const blocked = !byEmail.allowed ? byEmail : !byIp.allowed ? byIp : null;
  if (!blocked) return null;

  return Response.json(
    { error: "Too many requests. Please wait a moment and try again." },
    {
      status: 429,
      headers: { "Retry-After": String(blocked.retryAfterSeconds) },
    }
  );
}
