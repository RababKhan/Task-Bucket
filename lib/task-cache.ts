// Tiny client-side cache for the task-detail payload (`GET /api/tasks/:id`).
// List/Board rows warm this on hover (prefetchTaskDetail) so opening a task
// renders instantly from cache instead of waiting on a fresh round-trip.

const cache = new Map<string, unknown>();

export function getCachedTaskDetail<T = unknown>(id: string): T | undefined {
  return cache.get(id) as T | undefined;
}

export function setCachedTaskDetail(id: string, data: unknown): void {
  cache.set(id, data);
}

// Fetch + cache a task's detail (once). Safe to call repeatedly (e.g. on hover);
// it no-ops if already cached and swallows errors.
export async function prefetchTaskDetail(id: string): Promise<void> {
  if (cache.has(id)) return;
  try {
    const res = await fetch(`/api/tasks/${id}`);
    if (res.ok) cache.set(id, await res.json());
  } catch {
    /* ignore — the detail page will fetch normally on open */
  }
}
