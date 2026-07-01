// Central query-key factory so every hook + cache write/invalidate agrees on
// the same keys. Keys are arrays: a stable prefix + any parameters.

export const queryKeys = {
  // Board/projects list — GET /api/projects (ProjectWithCount[]).
  projects: ["projects"] as const,

  // Tasks for one project — GET /api/tasks?project_id=…
  projectTasks: (projectId: number | string) =>
    ["tasks", "project", Number(projectId)] as const,

  // Members — GET /api/members (all) or /api/members?project_id=… (scoped).
  members: (projectId?: number | string | null) =>
    projectId == null
      ? (["members", "all"] as const)
      : (["members", "project", Number(projectId)] as const),

  // Sprints for one project — GET /api/sprints?project_id=…
  sprints: (projectId: number | string) =>
    ["sprints", "project", Number(projectId)] as const,

  // Single task detail — GET /api/tasks/[id]
  task: (taskId: number | string) => ["task", String(taskId)] as const,

  // Comments for a task — GET /api/tasks/[id]/comments
  taskComments: (taskId: number | string) =>
    ["task", String(taskId), "comments"] as const,

  // Team directory — GET /api/team/members?…filters
  teamMembers: (params?: Record<string, string | number>) =>
    params ? (["team-members", params] as const) : (["team-members"] as const),

  // Single team-member detail — GET /api/team/members/[uid]
  teamMember: (uid: number | string) => ["team-member", String(uid)] as const,
};
