import { QueryClient } from "@tanstack/react-query";

// Tuned for a remote Turso DB (~84ms/query): keep data fresh enough to avoid
// staleness bugs, but cache aggressively so tab/module switches read from
// memory and revalidate quietly in the background — the "Linear feel".
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 30s — no refetch on remount/navigation
        // within that window, so switching List ↔ Board ↔ Sprint is instant.
        staleTime: 30_000,
        // Keep unused data around for 5 min so returning to a view is instant.
        gcTime: 5 * 60_000,
        // We revalidate on focus but never throw away the cached view first.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
