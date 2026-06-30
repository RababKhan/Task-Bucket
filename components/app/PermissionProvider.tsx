"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { permKey, type Module, type Action } from "@/lib/permissions";

// Client-side permission context. Fetches the signed-in user's effective
// permissions once and exposes a `can(module, action)` check used to hide UI
// the user can't use. This is a UX convenience only — every action is also
// enforced on the server, which is the real protection.

type PermState = {
  role: string | null;
  roleName: string | null;
  isAdmin: boolean;
  active: boolean;
  permissions: Set<string>;
  loaded: boolean;
};

type PermContextValue = PermState & {
  can: (module: Module, action: Action) => boolean;
  refresh: () => Promise<void>;
};

const PermissionContext = createContext<PermContextValue | null>(null);

export default function PermissionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<PermState>({
    role: null,
    roleName: null,
    isAdmin: false,
    active: true,
    permissions: new Set(),
    loaded: false,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions/me");
      if (!res.ok) {
        setState((s) => ({ ...s, loaded: true }));
        return;
      }
      const data = await res.json();
      setState({
        role: data.role ?? null,
        roleName: data.role_name ?? null,
        isAdmin: !!data.is_admin,
        active: data.active !== false,
        permissions: new Set<string>(data.permissions ?? []),
        loaded: true,
      });
    } catch {
      setState((s) => ({ ...s, loaded: true }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const can = useCallback(
    (module: Module, action: Action) => {
      if (state.isAdmin) return true;
      return state.permissions.has(permKey(module, action));
    },
    [state.isAdmin, state.permissions]
  );

  return (
    <PermissionContext.Provider value={{ ...state, can, refresh }}>
      {children}
    </PermissionContext.Provider>
  );
}

// Access the full permission state (role, loaded flag, etc.).
export function usePerms(): PermContextValue {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    // Safe fallback when used outside the provider: deny everything until loaded.
    return {
      role: null,
      roleName: null,
      isAdmin: false,
      active: true,
      permissions: new Set(),
      loaded: false,
      can: () => false,
      refresh: async () => {},
    };
  }
  return ctx;
}

// Convenience hook for a single permission check.
export function useCan(module: Module, action: Action): boolean {
  return usePerms().can(module, action);
}
