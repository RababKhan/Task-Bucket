"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Member } from "@/lib/types";

// ---- Fetchers ----
// Shared by the hooks AND the hover-prefetchers so a prefetched cache entry is
// identical to what the hook later reads (same key + same data shape).
export const fetchProjects = <T = unknown>() => apiGet<T[]>("/api/projects");

export const fetchProjectTasks = <T = unknown>(projectId: number | string) =>
  apiGet<T[]>(`/api/tasks?project_id=${projectId}`);

export async function fetchMembers(
  projectId?: number | null
): Promise<Member[]> {
  const url =
    projectId != null ? `/api/members?project_id=${projectId}` : "/api/members";
  const d = await apiGet<{ members?: Member[] }>(url);
  return Array.isArray(d.members) ? d.members : [];
}

export const fetchSprints = <T = unknown>(projectId: number | string) =>
  apiGet<T[]>(`/api/sprints?project_id=${projectId}`);

// ---- Read hooks ----
// One shared `projects` cache feeds both the board (`/`) and the projects list.
export function useProjects<T = unknown>() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => fetchProjects<T>(),
  });
}

export function useProjectTasks<T = unknown>(projectId: number | null) {
  return useQuery({
    queryKey:
      projectId != null ? queryKeys.projectTasks(projectId) : ["tasks", "none"],
    queryFn: () => fetchProjectTasks<T>(projectId!),
    enabled: projectId != null,
  });
}

export function useMembers(projectId?: number | null) {
  return useQuery({
    queryKey: queryKeys.members(projectId ?? null),
    queryFn: () => fetchMembers(projectId ?? null),
  });
}

export function useSprints<T = unknown>(projectId: number | null) {
  return useQuery({
    queryKey:
      projectId != null ? queryKeys.sprints(projectId) : ["sprints", "none"],
    queryFn: () => fetchSprints<T>(projectId!),
    enabled: projectId != null,
  });
}

export function useTaskDetail<T = unknown>(taskId: string | null) {
  return useQuery({
    queryKey: taskId ? queryKeys.task(taskId) : ["task", "none"],
    queryFn: () => apiGet<T>(`/api/tasks/${taskId}`),
    enabled: !!taskId,
  });
}

// ---- Hover prefetchers ----
// `prefetchQuery` respects staleTime, so re-hovering fresh data is a no-op.
// Fire-and-forget on mouse-enter to warm the cache before the click lands.
export function usePrefetch() {
  const qc = useQueryClient();
  return {
    projects: () =>
      void qc.prefetchQuery({
        queryKey: queryKeys.projects,
        queryFn: () => fetchProjects(),
      }),
    // Warm a project's board: its tasks + assignable members.
    project: (projectId: number) => {
      void qc.prefetchQuery({
        queryKey: queryKeys.projectTasks(projectId),
        queryFn: () => fetchProjectTasks(projectId),
      });
      void qc.prefetchQuery({
        queryKey: queryKeys.members(projectId),
        queryFn: () => fetchMembers(projectId),
      });
    },
    sprints: (projectId: number) =>
      void qc.prefetchQuery({
        queryKey: queryKeys.sprints(projectId),
        queryFn: () => fetchSprints(projectId),
      }),
    members: (projectId?: number | null) =>
      void qc.prefetchQuery({
        queryKey: queryKeys.members(projectId ?? null),
        queryFn: () => fetchMembers(projectId ?? null),
      }),
    // Directory's default (unfiltered, first page) view — matches the key the
    // directory page builds on mount (PAGE_SIZE = 20).
    directory: () =>
      void qc.prefetchQuery({
        queryKey: ["team-members", "page=1&pageSize=20"],
        queryFn: () => apiGet("/api/team/members?page=1&pageSize=20"),
      }),
  };
}
