"use client";

import { useCallback, useEffect, useState } from "react";

type Updater<T> = T | ((prev: T) => T);

/**
 * useState that survives a reload, stored in localStorage under `storageKey`.
 *
 * The key may change during the component's life — the project view keys its
 * filters by project, so switching project must load that project's value
 * rather than carry the previous one across. To make that safe, the value is
 * held together with the key it belongs to:
 *
 *  - a value is only ever written under its own key, so the render in which
 *    the key has changed but the new value has not loaded yet cannot overwrite
 *    the new key with the old project's filters;
 *  - until the new key's value has loaded, `initial` is returned, so one
 *    project's label or assignee filter is never applied to another's tasks.
 *
 * Storage is read in an effect, not during render: the page is server-rendered
 * and localStorage does not exist there, so reading it in the initialiser would
 * produce a hydration mismatch.
 *
 * `parse` validates what was stored and returns null to fall back to `initial`
 * — stored data outlives the code that wrote it, and a renamed field or a
 * hand-edited value must not crash the page. Pass stable references (module
 * constants) for `initial` and `parse`.
 */
export function usePersistedState<T>(
  storageKey: string | null,
  initial: T,
  parse: (raw: unknown) => T | null
): [T, (next: Updater<T>) => void] {
  const [state, setState] = useState<{ key: string | null; value: T }>({
    key: null,
    value: initial,
  });

  useEffect(() => {
    if (!storageKey) return;
    let value = initial;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw != null) value = parse(JSON.parse(raw)) ?? initial;
    } catch {
      // Unreadable storage or malformed JSON: start from the default.
    }
    setState({ key: storageKey, value });
    // initial and parse are configuration, expected to be stable; re-running on
    // a fresh literal each render would keep resetting the state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || state.key !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state.value));
    } catch {
      // Private mode or a full quota: the setting still applies, it just won't
      // survive a reload.
    }
  }, [storageKey, state]);

  const set = useCallback(
    (next: Updater<T>) =>
      setState((s) => {
        const prev = s.key === storageKey ? s.value : initial;
        const value =
          typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        return { key: storageKey, value };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey]
  );

  return [state.key === storageKey ? state.value : initial, set];
}
