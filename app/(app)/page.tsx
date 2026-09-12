"use client";

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Project,
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
} from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  PROJECT_STATUS_LABELS,
  TASK_TYPE_ORDER,
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import TaskModal, { type TaskDraft } from "@/app/TaskModal";
import ProjectTabs from "@/components/app/ProjectTabs";
import {
  TaskFilterButton,
  TaskFilterChips,
  matchesTaskFilters,
  countActiveFilters,
  parseTaskFilters,
  NO_FILTERS,
  type TaskFilters,
} from "@/components/app/TaskFilterBar";
import { usePersistedState } from "@/lib/usePersistedState";
import { drawerBoxFor } from "@/lib/drawer-box";
import SprintView from "@/components/app/SprintView";
import { prefetchTaskDetail } from "@/lib/task-cache";
import { useQueryClient } from "@tanstack/react-query";
import { useProjects, useProjectTasks, useMembers } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import StatusIcon from "@/components/app/StatusIcon";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import { PersonIcon } from "@/components/app/FilterBar";
import SelectField, { type SelectOption } from "@/components/app/SelectField";
import MemberPicker from "@/components/app/MemberPicker";
import DatePicker from "@/components/app/DatePicker";
import LabelsField from "@/components/app/LabelsField";
import EmptyProjects from "@/components/app/EmptyProjects";
import CreateProjectModal from "@/components/app/CreateProjectModal";

type ProjectWithCount = Project & {
  task_count: number;
  progress: number;
};
type BoardTask = Task & {
  subtask_total?: number;
  subtask_done?: number;
  assignees?: string[];
};

const PRIO_COLOR: Record<string, string> = {
  critical: "var(--prio-critical)",
  high: "var(--prio-high)",
  medium: "var(--prio-medium)",
  low: "var(--prio-low)",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// List toolbar: sort fields and grouping options.
type TaskSortKey = "title" | "status" | "priority" | "start" | "end";
const TASK_SORT_FIELDS: { key: TaskSortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "start", label: "Start Date" },
  { key: "end", label: "End Date" },
];
type GroupKey = "none" | "status" | "priority" | "assignee";
const GROUP_FIELDS: { key: GroupKey; label: string }[] = [
  { key: "none", label: "None" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
];
const UNASSIGNED = "__unassigned__";

// Columns the View drawer can hide. Title is always on, as the projects
// table keeps its Project Name. Widths mirror the grid in features.css.
type ListColKey = "assignee" | "status" | "priority" | "start" | "end" | "labels";
const LIST_COLUMNS: { key: ListColKey; label: string; width: string }[] = [
  { key: "assignee", label: "Assignee", width: "70px" },
  { key: "status", label: "Status", width: "105px" },
  { key: "priority", label: "Priority", width: "105px" },
  { key: "start", label: "Start Date", width: "105px" },
  { key: "end", label: "End Date", width: "105px" },
  { key: "labels", label: "Labels", width: "105px" },
];
const DEFAULT_LIST_VISIBLE: Record<ListColKey, boolean> = {
  assignee: true,
  status: true,
  priority: true,
  start: true,
  end: true,
  labels: true,
};
// Undated rows sort last ascending rather than first.
const NO_DATE = "9999-99-99";

// Validate toolbar settings read back from storage; null falls back to the
// default. Stored values can outlive the options that produced them.
const parseSortKey = (v: unknown): TaskSortKey | null =>
  TASK_SORT_FIELDS.some((f) => f.key === v) ? (v as TaskSortKey) : null;
const parseSortDir = (v: unknown): "asc" | "desc" | null =>
  v === "asc" || v === "desc" ? v : null;
const parseGroupKey = (v: unknown): GroupKey | null =>
  GROUP_FIELDS.some((f) => f.key === v) ? (v as GroupKey) : null;

const STATUS_OPTS: SelectOption[] = STATUS_ORDER.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
  icon: <TaskStatusIcon status={s} size={15} />,
}));
const PRIORITY_OPTS: SelectOption[] = PRIORITY_ORDER.map((p) => ({
  value: p,
  label: PRIORITY_LABELS[p],
  icon: <PriorityIcon priority={p} size={14} />,
}));

// Editable defaults for the inline add-task row.
function blankNewTask() {
  return {
    type: "task" as TaskType,
    status: "backlog" as TaskStatus,
    priority: "medium" as TaskPriority,
    assignees: [] as string[],
    labels: [] as string[],
    start_date: null as string | null,
    due_date: null as string | null,
  };
}
// Cycle Story → Task → Bug → Story on each click of the add-row type icon.
function nextTaskType(t: TaskType): TaskType {
  const i = TASK_TYPE_ORDER.indexOf(t);
  return TASK_TYPE_ORDER[(i + 1) % TASK_TYPE_ORDER.length];
}

function BoardPage() {
  const params = useSearchParams();
  const router = useRouter();
  // Warm the route chunk + detail data on hover so opening a task is instant.
  const prefetchTask = (taskId: number) => {
    router.prefetch(`/task/${taskId}`);
    prefetchTaskDetail(String(taskId));
  };

  const urlProject = params.get("project");
  // List is the default project view; Board/Sprint shown when explicitly asked.
  const viewParam = params.get("view");
  const view: "board" | "list" | "sprint" =
    viewParam === "board" ? "board" : viewParam === "sprint" ? "sprint" : "list";

  const queryClient = useQueryClient();

  // Shared TanStack Query caches: projects + the active project's tasks/members.
  // Switching tabs/projects renders from cache instantly and revalidates in the
  // background. Local mirrors keep the existing optimistic-update handlers.
  const projectsQuery = useProjects<ProjectWithCount>();
  const projectsData = projectsQuery.data;

  const [activeId, setActiveId] = useState<number | null>(null);
  const tasksQuery = useProjectTasks<BoardTask>(activeId);
  const membersQuery = useMembers(activeId);
  const members = membersQuery.data ?? [];

  const [projects, setProjects] = useState<ProjectWithCount[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  // Spinner only on the very first load (nothing cached yet).
  const loading = projectsQuery.isLoading;
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");

  // List toolbar: filter, sort and group — same controls as the Projects
  // table. All three survive a reload and are remembered per project: Label
  // and Assignee values belong to one project, so carrying them into another
  // would usually filter everything out.
  const viewKey = activeId != null ? `tb-list:${activeId}` : null;
  const [taskFilters, setTaskFilters] = usePersistedState<TaskFilters>(
    viewKey && `${viewKey}:filters`,
    NO_FILTERS,
    parseTaskFilters
  );
  const [sortOpen, setSortOpen] = useState(false);
  const [sortBy, setSortBy] = usePersistedState<TaskSortKey | null>(
    viewKey && `${viewKey}:sortBy`,
    null,
    parseSortKey
  );
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">(
    viewKey && `${viewKey}:sortDir`,
    "asc",
    parseSortDir
  );
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupBy, setGroupBy] = usePersistedState<GroupKey>(
    viewKey && `${viewKey}:groupBy`,
    "none",
    parseGroupKey
  );
  // View settings: page size + which columns show. Held as a draft while the
  // drawer is open and written only when Save is pressed, as in the projects
  // table.
  const [viewOpen, setViewOpen] = useState(false);
  // The drawer lines up with the table rather than the window, so measure the
  // card each time it opens (and on resize while it is open).
  const tableTopRef = useRef<HTMLDivElement>(null);
  const tableBottomRef = useRef<HTMLDivElement>(null);
  const [drawerBox, setDrawerBox] = useState<{ top: number; bottom: number } | null>(null);
  const [viewClosing, setViewClosing] = useState(false);
  const [viewSaving, setViewSaving] = useState(false);
  const [visibleCols, setVisibleCols] =
    useState<Record<ListColKey, boolean>>(DEFAULT_LIST_VISIBLE);

  // Collapsed groups, remembered per project like the rest of the toolbar.
  // Keyed "<grouping>:<group>", so one grouping's collapses do not leak into
  // another's.
  const [collapsed, setCollapsed] = usePersistedState<string[]>(
    viewKey && `${viewKey}:collapsedGroups`,
    [],
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : null)
  );
  // Read this project's saved view settings whenever the project changes.
  useEffect(() => {
    if (!viewKey) return;
    let next = DEFAULT_LIST_VISIBLE;
    try {
      const raw = localStorage.getItem(`${viewKey}:view`);
      if (raw) {
        const v = JSON.parse(raw);
        if (v.visible) next = { ...DEFAULT_LIST_VISIBLE, ...v.visible };
      }
    } catch {}
    setVisibleCols(next);
  }, [viewKey]);

  const measureDrawer = useCallback(() => {
    const top = tableTopRef.current?.getBoundingClientRect().top;
    const tableBottom = tableBottomRef.current?.getBoundingClientRect().bottom;
    if (top == null || tableBottom == null) return;
    setDrawerBox(drawerBoxFor(top, tableBottom));
  }, []);

  useEffect(() => {
    if (!viewOpen) return;
    measureDrawer();
    window.addEventListener("resize", measureDrawer);
    return () => window.removeEventListener("resize", measureDrawer);
  }, [viewOpen, measureDrawer]);

  function closeView() {
    if (viewClosing) return;
    setViewClosing(true);
    window.setTimeout(() => {
      setViewOpen(false);
      setViewClosing(false);
    }, 220);
  }

  function saveView() {
    if (viewSaving || !viewKey) return;
    setViewSaving(true);
    window.setTimeout(() => {
      try {
        localStorage.setItem(
          `${viewKey}:view`,
          JSON.stringify({ visible: visibleCols })
        );
      } catch {}
      setViewSaving(false);
      closeView();
    }, 550);
  }

  function resetView() {
    setVisibleCols(DEFAULT_LIST_VISIBLE);
  }

  // The grid every row follows: control column, title, whichever columns are
  // on, then the row menu.
  const visibleListCols = LIST_COLUMNS.filter((c) => visibleCols[c.key]);
  const listGridCols = `34px minmax(160px, 1fr) ${visibleListCols
    .map((c) => c.width)
    .join(" ")} 32px`;

  const isCollapsed = (groupKey: string) =>
    collapsed.includes(`${groupBy}:${groupKey}`);
  const toggleGroup = (groupKey: string) => {
    const id = `${groupBy}:${groupKey}`;
    setCollapsed((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  };

  function applySort(key: TaskSortKey) {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  }
  function clearSort() {
    setSortBy(null);
    setSortOpen(false);
  }
  function clearAllTools() {
    setTaskFilters({});
    setSortBy(null);
    setGroupBy("none");
    setSortOpen(false);
    setGroupOpen(false);
  }
  const activeFilterCount = countActiveFilters(taskFilters);
  const toolsActive =
    activeFilterCount > 0 || sortBy !== null || groupBy !== "none";

  const [editing, setEditing] = useState<BoardTask | null>(null);
  const [creatingStatus, setCreatingStatus] = useState<TaskStatus | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);

  // List-table row controls (selection, drag-reorder, kebab, delete).
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [taskMenuId, setTaskMenuId] = useState<number | null>(null);
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<number | null>(null);
  // Delete-confirmation modal (single via kebab, or bulk via selection bar).
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<BoardTask | null>(null);
  const [bulkDeleteTasks, setBulkDeleteTasks] = useState(false);
  // Add-to-sprint modal (bulk from the selection bar).
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [sprintOptions, setSprintOptions] = useState<SelectOption[]>([]);
  const [chosenSprint, setChosenSprint] = useState("");
  const [addingSprint, setAddingSprint] = useState(false);
  const [deletingTasks, setDeletingTasks] = useState(false);
  const stickyRef = useRef<HTMLDivElement>(null);

  // Per-project task cap for the current plan (Free: 200; Pro: null/unlimited).
  const [taskLimit, setTaskLimit] = useState<number | null>(null);
  // Inline "add task" row at the bottom of the list table (editable defaults).
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTask, setNewTask] = useState(blankNewTask);
  const [savingTask, setSavingTask] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const addRowRef = useRef<HTMLDivElement>(null);

  // The current plan's per-project task cap (Free = 200, Pro = unlimited).
  useEffect(() => {
    fetch("/api/workspace/plan")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.limits) setTaskLimit(d.limits.tasksPerProject ?? null);
      })
      .catch(() => {});
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId]
  );

  // Task-id prefix: first 3 alphanumerics of the project name, uppercased
  // (e.g. "Development" → "DEV"), used as DEV-001, DEV-002, …
  const projectPrefix = useMemo(
    () =>
      (activeProject?.name ?? "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 3)
        .toUpperCase() || "TSK",
    [activeProject]
  );

  // Invalidating a query refetches it and the mirror effects below push the
  // fresh data into local state — replacing the old hand-rolled loaders.
  const loadProjects = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
    [queryClient]
  );
  const loadTasks = useCallback(
    (projectId: number) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectTasks(projectId),
      }),
    [queryClient]
  );

  // Cache → local mirrors (so optimistic setProjects/setTasks keep working).
  // `[]` is truthy, so empty projects correctly clear the list; `undefined`
  // (still loading a never-seen project) is skipped to avoid an empty flash.
  useEffect(() => {
    if (projectsData) setProjects(projectsData);
  }, [projectsData]);
  useEffect(() => {
    const data = tasksQuery.data;
    if (data) setTasks(data);
  }, [tasksQuery.data]);

  // Pick the active project once projects load, honoring ?project= and falling
  // back to the first project (or a new one after the current is deleted).
  useEffect(() => {
    if (!projectsData) return;
    setActiveId((cur) => {
      if (cur && projectsData.some((p) => p.id === cur)) return cur;
      const pid = Number(urlProject);
      if (pid && projectsData.some((p) => p.id === pid)) return pid;
      return projectsData[0]?.id ?? null;
    });
  }, [projectsData, urlProject]);

  // React to ?project= changes from search / project list navigation.
  useEffect(() => {
    if (urlProject) setActiveId(Number(urlProject));
  }, [urlProject]);

  // Expose the pinned project-header height so the table header can stick below
  // it. Defer to rAF and skip redundant writes to avoid a resize/reflow loop
  // (which makes the page jitter while scrolling).
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    let prev = "";
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const v = `${el.offsetHeight}px`;
        if (v !== prev) {
          prev = v;
          document.documentElement.style.setProperty("--proj-sticky-h", v);
        }
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [activeId, view, loading]);

  // Broadcast the active project name so the topbar can show a breadcrumb.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("tb:active-project", {
        detail: activeProject ? { name: activeProject.name } : null,
      })
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("tb:active-project", { detail: null })
      );
    };
  }, [activeProject]);

  // ---- Project actions ----
  const createProject = () => setCreateOpen(true);

  function onProjectCreated(p: Project) {
    setCreateOpen(false);
    // Optimistically show the new (empty) project right away — no spinner, no
    // empty-state flash. Reconcile the list in the background. Land on the
    // List view.
    setProjects((cur) =>
      cur.some((x) => x.id === p.id)
        ? cur
        : [{ ...p, task_count: 0, progress: 0 }, ...cur]
    );
    setActiveId(p.id);
    void loadProjects();
    router.push(`/?project=${p.id}&view=list`);
  }

  async function renameProject() {
    if (!activeProject) return;
    const name = window.prompt("Project name", activeProject.name);
    if (name === null) return;
    const description =
      window.prompt("Description", activeProject.description) ??
      activeProject.description;
    await fetch(`/api/projects/${activeProject.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    await loadProjects();
  }

  async function deleteProject() {
    if (!activeProject) return;
    if (
      !window.confirm(
        `Delete "${activeProject.name}" and all its tasks? This cannot be undone.`
      )
    )
      return;
    setDeletingProject(true);
    try {
      await fetch(`/api/projects/${activeProject.id}`, { method: "DELETE" });
      await loadProjects();
    } finally {
      setDeletingProject(false);
    }
  }

  // ---- Task actions ----
  async function saveTask(draft: TaskDraft) {
    if (editing) {
      await fetch(`/api/tasks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
    } else if (activeId != null) {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, project_id: activeId }),
      });
    }
    setEditing(null);
    setCreatingStatus(null);
    if (activeId != null) await loadTasks(activeId);
    await loadProjects(); // refresh counts
  }

  // Create a task from just a title (defaults applied server-side), then keep
  // the inline row open and focused so several can be added in a row.
  async function quickAddTask() {
    const title = newTaskTitle.trim();
    if (!title || activeId == null || savingTask) return;
    setSavingTask(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, project_id: activeId, ...newTask }),
    });
    setNewTaskTitle("");
    setNewTask(blankNewTask());
    setSavingTask(false);
    await loadTasks(activeId);
    await loadProjects();
    // The new item renders just above the add row; once the DOM has updated,
    // scroll it into view and refocus the input (without a competing scroll).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        addRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        addInputRef.current?.focus({ preventScroll: true });
      })
    );
  }

  async function openSprintModal() {
    if (activeId == null) return;
    setChosenSprint("");
    setSprintOptions([]);
    setSprintModalOpen(true);
    const res = await fetch(`/api/sprints?project_id=${activeId}`);
    if (res.ok) {
      const list = (await res.json()) as { id: number; name: string }[];
      setSprintOptions(list.map((s) => ({ value: String(s.id), label: s.name })));
    }
  }

  async function addSelectedToSprint() {
    if (!chosenSprint || addingSprint) return;
    setAddingSprint(true);
    const ids = [...selectedTasks];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sprint_id: Number(chosenSprint) }),
        })
      )
    );
    setAddingSprint(false);
    setSprintModalOpen(false);
    setSelectedTasks(new Set());
    if (activeId != null) await loadTasks(activeId);
  }

  async function deleteTask() {
    if (!editing) return;
    await fetch(`/api/tasks/${editing.id}`, { method: "DELETE" });
    setEditing(null);
    if (activeId != null) await loadTasks(activeId);
    await loadProjects();
  }

  function toggleSelectTask(id: number) {
    setSelectedTasks((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function dropTask(targetId: number) {
    setTasks((cur) => {
      if (dragTaskId == null || dragTaskId === targetId) return cur;
      const arr = [...cur];
      const from = arr.findIndex((t) => t.id === dragTaskId);
      const to = arr.findIndex((t) => t.id === targetId);
      if (from < 0 || to < 0) return cur;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
    setDragTaskId(null);
    setDragOverTaskId(null);
  }

  async function deleteTaskById(id: number) {
    setTasks((cur) => cur.filter((t) => t.id !== id));
    setSelectedTasks((cur) => {
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await loadProjects();
  }

  async function deleteSelectedTasks() {
    const ids = [...selectedTasks];
    if (!ids.length) return;
    setTasks((cur) => cur.filter((t) => !ids.includes(t.id)));
    setSelectedTasks(new Set());
    await Promise.all(
      ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }))
    );
    await loadProjects();
  }

  async function confirmDeleteTask() {
    setDeletingTasks(true);
    if (bulkDeleteTasks) await deleteSelectedTasks();
    else if (deleteTaskTarget) await deleteTaskById(deleteTaskTarget.id);
    setDeletingTasks(false);
    setDeleteTaskTarget(null);
    setBulkDeleteTasks(false);
  }

  // Inline edits from the list table.
  async function updateTask(id: number, patch: Record<string, unknown>) {
    setTasks((cur) =>
      cur.map((t) => (t.id === id ? ({ ...t, ...patch } as BoardTask) : t))
    );
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if ("status" in patch) await loadProjects(); // refresh progress
  }

  async function moveTask(task: Task, dir: -1 | 1) {
    const idx = STATUS_ORDER.indexOf(task.status);
    const next = STATUS_ORDER[idx + dir];
    if (!next || movingId === task.id) return;
    setMovingId(task.id);
    setTasks((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, status: next } : t))
    );
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (activeId != null) await loadTasks(activeId);
    } finally {
      setMovingId(null);
    }
  }

  // Search + status filter. Shared by both views, so the Board columns show the
  // same set of tasks the List does.
  const visibleTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (!q || t.title.toLowerCase().includes(q)) &&
        matchesTaskFilters(t, taskFilters)
    );
  }, [tasks, query, taskFilters]);

  const sortedTasks = useMemo(() => {
    if (!sortBy) return visibleTasks;
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (t: BoardTask): string | number => {
      switch (sortBy) {
        case "title":
          return t.title.toLowerCase();
        case "status":
          return STATUS_ORDER.indexOf(t.status);
        case "priority":
          return PRIORITY_ORDER.indexOf(t.priority);
        case "start":
          return t.start_date || NO_DATE;
        case "end":
          return t.due_date || NO_DATE;
      }
    };
    return [...visibleTasks].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [visibleTasks, sortBy, sortDir]);

  const tasksByStatus = useMemo(() => {
    const map = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, [] as BoardTask[]])
    ) as Record<TaskStatus, BoardTask[]>;
    for (const t of sortedTasks) {
      (map[t.status] ?? map.backlog).push(t);
    }
    return map;
  }, [sortedTasks]);

  // Without an explicit sort the list keeps its status-ordered default.
  const listTasks = useMemo(
    () =>
      sortBy ? sortedTasks : STATUS_ORDER.flatMap((s) => tasksByStatus[s]),
    [sortBy, sortedTasks, tasksByStatus]
  );

  // Rows are rendered group by group; with no grouping that is one unlabelled
  // group holding everything, so the render path stays the same either way.
  const listGroups = useMemo(() => {
    if (groupBy === "none") {
      return [
        {
          key: "all",
          label: null as string | null,
          icon: null as ReactNode,
          tasks: listTasks,
        },
      ];
    }
    if (groupBy === "assignee") {
      // A task with several assignees belongs under each of them, so it shows
      // up in every list it is actually on. Unassigned work goes last.
      const order = [...members.map((m) => m.user_id), UNASSIGNED];
      const labels = new Map(
        members.map((m) => [m.user_id, m.name || m.email || "Unknown"])
      );
      const buckets = new Map<string, BoardTask[]>(order.map((k) => [k, []]));
      for (const t of listTasks) {
        const ids = (t.assignees ?? []).filter((id) => buckets.has(id));
        if (ids.length === 0) buckets.get(UNASSIGNED)!.push(t);
        else for (const id of ids) buckets.get(id)!.push(t);
      }
      return order
        .filter((k) => (buckets.get(k) ?? []).length > 0)
        .map((k) => {
          const label = k === UNASSIGNED ? "Unassigned" : labels.get(k) ?? k;
          const m = members.find((x) => x.user_id === k);
          return {
            key: k,
            label,
            icon:
              k === UNASSIGNED ? null : (
                <PersonIcon name={label} image={m?.image ?? null} />
              ),
            tasks: buckets.get(k)!,
          };
        });
    }
    const order: string[] =
      groupBy === "status" ? [...STATUS_ORDER] : [...PRIORITY_ORDER];
    const labels: Record<string, string> =
      groupBy === "status" ? STATUS_LABELS : PRIORITY_LABELS;
    const buckets = new Map<string, BoardTask[]>(order.map((k) => [k, []]));
    for (const t of listTasks) {
      const k = groupBy === "status" ? t.status : t.priority;
      (buckets.get(k) ?? buckets.get(order[0])!).push(t);
    }
    // Empty groups are noise, not information.
    return order
      .filter((k) => (buckets.get(k) ?? []).length > 0)
      .map((k) => ({
        key: k,
        label: labels[k] ?? k,
        icon:
          groupBy === "status" ? (
            <TaskStatusIcon status={k as TaskStatus} size={16} />
          ) : (
            <PriorityIcon priority={k as TaskPriority} size={15} />
          ),
        tasks: buckets.get(k)!,
      }));
  }, [groupBy, listTasks, members]);

  // Per-project task cap reached (Free plan) — blocks adding more items.
  const atTaskLimit = taskLimit != null && tasks.length >= taskLimit;
  const taskLimitTip = `Upgrade to Pro — ${taskLimit} tasks per project limit reached`;

  // Header select-all: toggles every row beneath that heading row — the whole
  // list ungrouped, or just the group it heads.
  const allListSelected =
    listTasks.length > 0 && listTasks.every((t) => selectedTasks.has(t.id));
  function toggleScope(scope: BoardTask[]) {
    const all = scope.length > 0 && scope.every((t) => selectedTasks.has(t.id));
    setSelectedTasks((cur) => {
      const next = new Set(cur);
      for (const t of scope) {
        if (all) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  // The column heading row. Rendered once above an ungrouped list, and again
  // under each group header when the list is grouped, so the columns stay
  // named as you read down the page.
  function listHead(scope: BoardTask[]) {
    const all = scope.length > 0 && scope.every((t) => selectedTasks.has(t.id));
    const some = scope.some((t) => selectedTasks.has(t.id));
    return (
      <div className="tl-head" style={{ gridTemplateColumns: listGridCols }}>
        <span className="tl-head-check">
          {selectedTasks.size > 0 && (
            <input
              type="checkbox"
              className="pv-check"
              checked={all}
              ref={(el) => {
                if (el) el.indeterminate = some && !all;
              }}
              onChange={() => toggleScope(scope)}
              aria-label={all ? "Deselect all" : "Select all"}
            />
          )}
        </span>
        <span>Title</span>
        {visibleListCols.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
        <span />
      </div>
    );
  }

  // Previously-used labels in this project, offered as suggestions in the modal.
  const labelSuggestions = useMemo(
    () =>
      [...new Set(tasks.flatMap((t) => t.labels ?? []))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [tasks]
  );

  const modalOpen = editing !== null || creatingStatus !== null;

  const emptyState = (
    <div className="empty-hero task-empty">
      <div className="empty-box">
        <span className="empty-cubes task-empty-ill">
          {view === "board" ? (
            <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="28" y="32" width="24" height="60" rx="4" />
              <rect x="58" y="32" width="24" height="60" rx="4" />
              <rect x="88" y="32" width="24" height="60" rx="4" />
              <rect x="32" y="62" width="16" height="9" rx="2.5" />
              <rect x="92" y="38" width="16" height="9" rx="2.5" />
              <rect
                className="board-card-move"
                x="32"
                y="38"
                width="16"
                height="9"
                rx="2.5"
                fill="currentColor"
                fillOpacity="0.14"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M40 28h-6a6 6 0 0 0-6 6v60a6 6 0 0 0 6 6h52a6 6 0 0 0 6-6V34a6 6 0 0 0-6-6h-6" />
              <rect x="44" y="20" width="32" height="16" rx="4" />
              <path className="cubes-grid" d="M40 52l3 3 5-6M56 53h22M40 68l3 3 5-6M56 69h22M40 84l3 3 5-6M56 85h16" />
            </svg>
          )}
        </span>
        <h2>No tasks yet</h2>
        <p>
          Tasks are the individual pieces of work in a project. Add your first
          task to start tracking progress here.
        </p>
        <div className="empty-actions">
          <button
            className="empty-create-btn"
            onClick={() => setCreatingStatus("backlog")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Item
          </button>
          <a
            className="empty-doc-btn"
            href="https://github.com/RababKhan/Task-Bucket"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  if (!activeProject) {
    return (
      <>
        <EmptyProjects onCreate={createProject} />
        {createOpen && (
          <CreateProjectModal
            onClose={() => setCreateOpen(false)}
            onCreated={onProjectCreated}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="board-view">
      <div className="proj-sticky" ref={stickyRef}>
      <div className="main-header">
        <div className="board-title">
          <div className="proj-head-row">
            <div className="proj-switcher-btn">
              <span className="proj-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
                </svg>
              </span>
              <h1>{activeProject.name}</h1>
            </div>

            <span className="proj-task-count">
              {tasks.length} {tasks.length === 1 ? "item" : "items"}
            </span>

            <span className="proj-status-view">
              <StatusIcon status={activeProject.status} size={18} />
              {PROJECT_STATUS_LABELS[activeProject.status]}
              <span className="proj-progress-pct">{activeProject.progress}%</span>
            </span>
          </div>
          {activeProject.description && <p>{activeProject.description}</p>}
        </div>

        <div className="header-actions">
          <button type="button" className="pv-tool-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 3v16a2 2 0 0 0 2 2h16" />
              <path d="m7 14 4-4 3 3 5-5" />
            </svg>
            Insights
          </button>
          <button
            type="button"
            className="pv-tool-btn"
            onClick={() => router.push(`/project/${activeProject.id}/details`)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Configuration
          </button>
        </div>
      </div>

      <ProjectTabs
        projectId={activeProject.id}
        active={
          view === "sprint" ? "sprints" : view === "list" ? "list" : "board"
        }
      />

      {view !== "sprint" && (
      <div className="proj-toolbar">
        <div className="proj-toolbar-left">
          <span
            className="tl-add-lock"
            data-tip={atTaskLimit ? taskLimitTip : undefined}
          >
            <button
              type="button"
              className="pv-tool-btn pv-primary"
              disabled={atTaskLimit}
              onClick={() => {
                if (atTaskLimit) return;
                setCreatingStatus("backlog");
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Item
            </button>
          </span>
          <div className="proj-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="proj-search-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {view === "list" && (
            <div className="pv-sort">
              <button
                className={`pv-tool-btn${groupBy !== "none" ? " active" : ""}`}
                type="button"
                onClick={() => setGroupOpen((o) => !o)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 7h18M3 12h12M3 17h6" />
                </svg>
                Group By
                {groupBy !== "none" && (
                  <span className="pv-sort-tag">
                    {GROUP_FIELDS.find((f) => f.key === groupBy)?.label}
                  </span>
                )}
              </button>
              {groupOpen && (
                <>
                  <div className="pv-menu-backdrop" onClick={() => setGroupOpen(false)} />
                  <div className="pv-sort-menu">
                    {GROUP_FIELDS.map((f) => (
                      <button
                        key={f.key}
                        className={`pv-sort-item${groupBy === f.key ? " active" : ""}`}
                        onClick={() => {
                          setGroupBy(f.key);
                          setGroupOpen(false);
                        }}
                      >
                        {f.label}
                        {groupBy === f.key && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 12l4 4 10-10" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <TaskFilterButton
            value={taskFilters}
            onChange={setTaskFilters}
            members={members}
            labels={labelSuggestions}
          />

          <div className="pv-sort">
            <button
              className={`pv-tool-btn${sortBy ? " active" : ""}`}
              type="button"
              onClick={() => setSortOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {sortBy ? (
                  sortDir === "asc" ? (
                    <path d="M4 6h10M4 12h7M4 18h4M18 19V5M18 5l-3 3M18 5l3 3" />
                  ) : (
                    <path d="M4 6h10M4 12h7M4 18h4M18 5v14M18 19l-3-3M18 19l3-3" />
                  )
                ) : (
                  <path d="M3 7h12M3 12h8M3 17h4M17 5v14M17 19l3-3M17 19l-3-3" />
                )}
              </svg>
              Sort
              {sortBy && (
                <span className="pv-sort-tag">
                  {TASK_SORT_FIELDS.find((f) => f.key === sortBy)?.label}
                </span>
              )}
            </button>
            {sortOpen && (
              <>
                <div className="pv-menu-backdrop" onClick={() => setSortOpen(false)} />
                <div className="pv-sort-menu">
                  {TASK_SORT_FIELDS.map((f) => (
                    <button
                      key={f.key}
                      className={`pv-sort-item${sortBy === f.key ? " active" : ""}`}
                      onClick={() => applySort(f.key)}
                    >
                      {f.label}
                      {sortBy === f.key && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          {sortDir === "asc" ? (
                            <path d="m6 15 6-6 6 6" />
                          ) : (
                            <path d="m6 9 6 6 6-6" />
                          )}
                        </svg>
                      )}
                    </button>
                  ))}
                  {sortBy && (
                    <button className="pv-sort-clear" onClick={clearSort}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <circle cx="12" cy="12" r="9" />
                        <path d="M15 9l-6 6M9 9l6 6" />
                      </svg>
                      Clear sort
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {toolsActive && (
            <button
              className="pv-tool-btn pv-clear-all"
              type="button"
              onClick={clearAllTools}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
              Clear all
            </button>
          )}
        </div>
        <button
          type="button"
          className="pv-tool-btn"
          onClick={() => setViewOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 4H14M10 4H3M21 12H12M8 12H3M21 20H16M12 20H3M14 2v4M8 10v4M16 18v4" />
          </svg>
          View
        </button>
      </div>
      )}

      {view !== "sprint" && (
        <TaskFilterChips
          value={taskFilters}
          onChange={setTaskFilters}
          members={members}
          labels={labelSuggestions}
        />
      )}
      </div>

      {view === "sprint" ? (
        <SprintView projectId={activeProject.id} />
      ) : tasks.length === 0 ? (
        emptyState
      ) : view === "board" ? (
        <div className="board">
          {STATUS_ORDER.map((status) => (
            <section className="column" key={status}>
              <div className="column-header">
                <span className="dot" style={{ background: STATUS_COLORS[status] }} />
                <h3>{STATUS_LABELS[status]}</h3>
                <span className="count">{tasksByStatus[status].length}</span>
              </div>

              {tasksByStatus[status].map((task) => {
                const idx = STATUS_ORDER.indexOf(task.status);
                const overdue =
                  task.due_date &&
                  task.status !== "done" &&
                  task.due_date < todayISO();
                return (
                  <article
                    key={task.id}
                    className="card"
                    onClick={() => router.push(`/task/${task.id}`)}
                    onMouseEnter={() => prefetchTask(task.id)}
                  >
                    <div className="card-title">{task.title}</div>
                    <div className="card-meta">
                      <span
                        className="badge"
                        style={{
                          color: PRIO_COLOR[task.priority],
                          borderColor: PRIO_COLOR[task.priority],
                        }}
                      >
                        {task.priority}
                      </span>
                      {task.due_date && (
                        <span className={`due ${overdue ? "overdue" : ""}`}>
                          📅 {task.due_date}
                        </span>
                      )}
                      {!!task.subtask_total && (
                        <span className="sub-badge">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M5 12l4 4 10-10" />
                          </svg>
                          {task.subtask_done}/{task.subtask_total}
                        </span>
                      )}
                    </div>
                    <div className="card-move" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={idx === 0 || movingId === task.id}
                        onClick={() => moveTask(task, -1)}
                      >
                        ← Move
                      </button>
                      <button
                        disabled={idx === STATUS_ORDER.length - 1 || movingId === task.id}
                        onClick={() => moveTask(task, 1)}
                      >
                        Move →
                      </button>
                    </div>
                  </article>
                );
              })}

              <button className="add-task" onClick={() => setCreatingStatus(status)}>
                + Add task
              </button>
            </section>
          ))}
        </div>
      ) : (
        <>
        <div
          ref={tableTopRef}
          className={`task-list${selectedTasks.size > 0 ? " has-selbar" : ""}`}
        >
          {selectedTasks.size > 0 && (
            <div className="pv-selbar">
              <span className="pv-selcount">{selectedTasks.size}</span>
              <button
                type="button"
                className="pv-selact"
                onClick={openSprintModal}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="12" cy="12" r="0.5" fill="currentColor" />
                </svg>
                Add to Sprint
              </button>
              {selectedTasks.size === 1 && (
                <button
                  type="button"
                  className="pv-selact"
                  onClick={() => {
                    const id = [...selectedTasks][0];
                    const t = tasks.find((x) => x.id === id);
                    if (t) setEditing(t);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                  Edit
                </button>
              )}
              <button
                type="button"
                className="pv-selact danger"
                onClick={() => setBulkDeleteTasks(true)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <path d="M10 11v6M14 11v6" />
                </svg>
                Delete
              </button>
            </div>
          )}
          {groupBy === "none" && listHead(listTasks)}
          {listGroups.map((group) => (
          <Fragment key={group.key}>
          {group.label && (
            <button
              type="button"
              className={`tl-group${isCollapsed(group.key) ? " collapsed" : ""}`}
              style={{ gridTemplateColumns: listGridCols }}
              onClick={() => toggleGroup(group.key)}
              aria-expanded={!isCollapsed(group.key)}
            >
              <span className="tl-group-inner">
                <svg className="tl-group-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m6 9 6 6 6-6" />
                </svg>
                {group.icon && <span className="tl-group-ic">{group.icon}</span>}
                <span className="tl-group-label">{group.label}</span>
                <span className="tl-group-count">{group.tasks.length}</span>
              </span>
            </button>
          )}
          {group.label && !isCollapsed(group.key) && listHead(group.tasks)}
          {(!group.label || !isCollapsed(group.key)) &&
            group.tasks.map((task) => (
            <div
              key={task.id}
              className={`tl-row${dragOverTaskId === task.id ? " dragover" : ""}${
                dragTaskId === task.id ? " dragging" : ""
              }${selectedTasks.has(task.id) ? " selected" : ""}`}
              style={{ gridTemplateColumns: listGridCols }}
              draggable
              onDragStart={() => setDragTaskId(task.id)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverTaskId !== task.id) setDragOverTaskId(task.id);
              }}
              onDrop={() => dropTask(task.id)}
              onDragEnd={() => {
                setDragTaskId(null);
                setDragOverTaskId(null);
              }}
            >
              <span className="pv-ctrl">
                <span className="pv-drag-handle" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                  </svg>
                </span>
                <input
                  type="checkbox"
                  className="pv-check"
                  checked={selectedTasks.has(task.id)}
                  onChange={() => toggleSelectTask(task.id)}
                  aria-label={`Select ${task.title}`}
                />
              </span>
              <span
                className="tl-title tl-title-link"
                onClick={() => router.push(`/task/${task.id}`)}
                onMouseEnter={() => prefetchTask(task.id)}
              >
                <TaskTypeIcon type={task.type} size={15} />
                {task.seq != null && (
                  <span className="tl-task-id">
                    {projectPrefix}-{String(task.seq).padStart(3, "0")}
                  </span>
                )}
                <span className="tl-title-text">{task.title}</span>
              </span>
              {visibleCols.assignee && (
                <span className="tl-cell">
                  <MemberPicker
                    inline
                    multiple
                    members={members}
                    value={task.assignees ?? []}
                    onChange={(ids) => updateTask(task.id, { assignees: ids })}
                    placeholder="Assign"
                  />
                </span>
              )}
              {visibleCols.status && (
                <span className="tl-cell">
                  <SelectField
                    inline
                    value={task.status}
                    options={STATUS_OPTS}
                    onChange={(v) => updateTask(task.id, { status: v })}
                  />
                </span>
              )}
              {visibleCols.priority && (
                <span className="tl-cell">
                  <SelectField
                    inline
                    value={task.priority}
                    options={PRIORITY_OPTS}
                    onChange={(v) => updateTask(task.id, { priority: v })}
                  />
                </span>
              )}
              {visibleCols.start && (
                <span className="tl-cell">
                  <DatePicker
                    inline
                    quick
                    value={task.start_date ?? ""}
                    max={task.due_date || undefined}
                    onChange={(v) => updateTask(task.id, { start_date: v || null })}
                  />
                </span>
              )}
              {visibleCols.end && (
                <span className="tl-cell">
                  <DatePicker
                    inline
                    quick
                    value={task.due_date ?? ""}
                    min={task.start_date || undefined}
                    onChange={(v) => updateTask(task.id, { due_date: v || null })}
                  />
                </span>
              )}
              {visibleCols.labels && (
                <span className="tl-cell tl-labels-cell">
                  <LabelsField
                    value={task.labels ?? []}
                    suggestions={labelSuggestions}
                    onChange={(labels) => updateTask(task.id, { labels })}
                  />
                </span>
              )}

              <button
                className={`pv-kebab${taskMenuId === task.id ? " open" : ""}`}
                aria-label="Row actions"
                onClick={() =>
                  setTaskMenuId(taskMenuId === task.id ? null : task.id)
                }
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
              {taskMenuId === task.id && (
                <>
                  <div
                    className="pv-menu-backdrop"
                    onClick={() => setTaskMenuId(null)}
                  />
                  <div className="pv-menu">
                    <button
                      className="pv-menu-item"
                      onClick={() => {
                        setTaskMenuId(null);
                        setEditing(task);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      className="pv-menu-item danger"
                      onClick={() => {
                        setTaskMenuId(null);
                        setDeleteTaskTarget(task);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          </Fragment>
          ))}
          {listTasks.length === 0 && !addingTask && (
            <div className="tl-empty">No tasks match your search.</div>
          )}
        </div>
        <div className="tl-foot" ref={tableBottomRef}>
          {addingTask && (
            <div
              className="tl-row tl-addrow"
              ref={addRowRef}
              style={{ gridTemplateColumns: listGridCols }}
            >
              <span className="pv-ctrl" />
              <span className="tl-title">
                <button
                  type="button"
                  className="tl-addtype"
                  style={{ borderColor: TASK_TYPE_COLORS[newTask.type] }}
                  data-tip={`Type: ${TASK_TYPE_LABELS[newTask.type]} (click to change)`}
                  data-tip-pos="right"
                  aria-label={`Type: ${TASK_TYPE_LABELS[newTask.type]} (click to change)`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    setNewTask((n) => ({ ...n, type: nextTaskType(n.type) }))
                  }
                >
                  <TaskTypeIcon type={newTask.type} size={15} />
                </button>
                <input
                  ref={addInputRef}
                  autoFocus
                  className="tl-add-input"
                  placeholder="Write a task name"
                  style={
                    {
                      borderColor: TASK_TYPE_COLORS[newTask.type],
                      "--tl-type": TASK_TYPE_COLORS[newTask.type],
                    } as CSSProperties
                  }
                  value={newTaskTitle}
                  disabled={savingTask}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      quickAddTask();
                    } else if (e.key === "Escape") {
                      setAddingTask(false);
                      setNewTaskTitle("");
                      setNewTask(blankNewTask());
                    }
                  }}
                  onBlur={() => {
                    // Close only if nothing's typed and focus left the whole row
                    // (so picking a status/date in this row doesn't dismiss it).
                    setTimeout(() => {
                      if (
                        !newTaskTitle.trim() &&
                        addRowRef.current &&
                        !addRowRef.current.contains(document.activeElement)
                      ) {
                        setAddingTask(false);
                        setNewTask(blankNewTask());
                      }
                    }, 120);
                  }}
                />
                {savingTask && (
                  <span className="tl-add-dots" aria-label="Creating">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </span>
              {visibleCols.assignee && (
                <span className="tl-cell">
                  <MemberPicker
                    inline
                    multiple
                    members={members}
                    value={newTask.assignees}
                    onChange={(ids) => setNewTask((n) => ({ ...n, assignees: ids }))}
                    placeholder="Assign"
                  />
                </span>
              )}
              {visibleCols.status && (
                <span className="tl-cell">
                  <SelectField
                    inline
                    value={newTask.status}
                    options={STATUS_OPTS}
                    onChange={(v) => {
                      setNewTask((n) => ({ ...n, status: v as TaskStatus }));
                      requestAnimationFrame(() => addInputRef.current?.focus());
                    }}
                  />
                </span>
              )}
              {visibleCols.priority && (
                <span className="tl-cell">
                  <SelectField
                    inline
                    value={newTask.priority}
                    options={PRIORITY_OPTS}
                    onChange={(v) => {
                      setNewTask((n) => ({ ...n, priority: v as TaskPriority }));
                      requestAnimationFrame(() => addInputRef.current?.focus());
                    }}
                  />
                </span>
              )}
              {visibleCols.start && (
                <span className="tl-cell">
                  <DatePicker
                    inline
                    quick
                    value={newTask.start_date ?? ""}
                    max={newTask.due_date || undefined}
                    onChange={(v) => {
                      setNewTask((n) => ({ ...n, start_date: v || null }));
                      requestAnimationFrame(() => addInputRef.current?.focus());
                    }}
                  />
                </span>
              )}
              {visibleCols.end && (
                <span className="tl-cell">
                  <DatePicker
                    inline
                    quick
                    value={newTask.due_date ?? ""}
                    min={newTask.start_date || undefined}
                    onChange={(v) => {
                      setNewTask((n) => ({ ...n, due_date: v || null }));
                      requestAnimationFrame(() => addInputRef.current?.focus());
                    }}
                  />
                </span>
              )}
              {visibleCols.labels && (
                <span className="tl-cell tl-labels-cell">
                  <LabelsField
                    value={newTask.labels}
                    suggestions={labelSuggestions}
                    onChange={(labels) => setNewTask((n) => ({ ...n, labels }))}
                  />
                </span>
              )}
              <span />
            </div>
          )}
          <span
            className="tl-add-lock"
            data-tip={atTaskLimit ? taskLimitTip : undefined}
            data-tip-pos="right"
          >
            <button
              type="button"
              className="pv-tool-btn tl-add"
              disabled={atTaskLimit}
              onClick={() => {
                if (atTaskLimit) return;
                setAddingTask(true);
                setNewTaskTitle("");
                requestAnimationFrame(() => addInputRef.current?.focus());
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Item
            </button>
          </span>
        </div>
        </>
      )}
      </div>

      {modalOpen && (
        <TaskModal
          task={editing}
          defaultStatus={creatingStatus ?? "backlog"}
          members={members}
          labelSuggestions={labelSuggestions}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => {
            setEditing(null);
            setCreatingStatus(null);
          }}
        />
      )}

      {createOpen && (
        <CreateProjectModal
          onClose={() => setCreateOpen(false)}
          onCreated={onProjectCreated}
        />
      )}

      {(deleteTaskTarget || bulkDeleteTasks) && (
        <div
          className="overlay"
          onMouseDown={() => {
            if (deletingTasks) return;
            setDeleteTaskTarget(null);
            setBulkDeleteTasks(false);
          }}
        >
          <div
            className="modal confirm-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="confirm-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M10 11v6M14 11v6" />
              </svg>
            </span>

            <h2>
              Delete{" "}
              {bulkDeleteTasks && selectedTasks.size > 1 ? "Items" : "Item"}
            </h2>
            <p className="confirm-text">
              Are you sure you want to delete{" "}
              {bulkDeleteTasks ? (
                <strong>
                  {selectedTasks.size} item{selectedTasks.size === 1 ? "" : "s"}
                </strong>
              ) : (
                <strong>{deleteTaskTarget?.title}</strong>
              )}
              ? This action cannot be undone.
            </p>

            <div className="confirm-actions">
              <button
                className="btn btn-primary confirm-keep"
                disabled={deletingTasks}
                onClick={() => {
                  setDeleteTaskTarget(null);
                  setBulkDeleteTasks(false);
                }}
              >
                No, Keep it
              </button>
              <button
                className="btn-outline confirm-del"
                onClick={confirmDeleteTask}
                disabled={deletingTasks}
              >
                {deletingTasks ? <Spinner /> : "Yes, Delete it"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sprintModalOpen && (
        <div
          className="overlay"
          onMouseDown={() => {
            if (!addingSprint) setSprintModalOpen(false);
          }}
        >
          <div
            className="modal sprint-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="sprint-modal-title">Add to Sprint</h2>
            <p className="sprint-modal-sub">
              Add{" "}
              <strong>
                {selectedTasks.size} item{selectedTasks.size === 1 ? "" : "s"}
              </strong>{" "}
              to a sprint.
            </p>
            <div className="sprint-modal-field">
              <SelectField
                value={chosenSprint}
                options={sprintOptions}
                onChange={setChosenSprint}
                placeholder={
                  sprintOptions.length
                    ? "Select a sprint"
                    : "No sprints in this project"
                }
              />
            </div>
            <div className="confirm-actions">
              <button
                className="btn btn-sm"
                onClick={() => setSprintModalOpen(false)}
                disabled={addingSprint}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={addSelectedToSprint}
                disabled={!chosenSprint || addingSprint}
              >
                {addingSprint ? <Spinner /> : "Add to Sprint"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewOpen && (
        <div
          className="pv-drawer-overlay"
          style={drawerBox ?? undefined}
          onMouseDown={closeView}
        >
          <aside
            className={`pv-drawer${viewClosing ? " closing" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="pv-drawer-head">
              <span className="pv-drawer-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 4H14M10 4H3M21 12H12M8 12H3M21 20H16M12 20H3M14 2v4M8 10v4M16 18v4" />
                </svg>
                View
              </span>
            </div>

            <div className="pv-drawer-body">
              <section className="pv-drawer-sec">
                <h4>Visible Columns</h4>
                <div className="pv-collist">
                  <div className="pv-collist-head">
                    <span>Columns Name</span>
                    <span>Show</span>
                  </div>
                  {/* Title always shows — a row with no name says nothing. */}
                  <label className="pv-colrow">
                    <span>Title</span>
                    <input type="checkbox" className="pv-check" checked disabled readOnly />
                  </label>
                  {LIST_COLUMNS.map((c) => (
                    <label key={c.key} className="pv-colrow">
                      <span>{c.label}</span>
                      <input
                        type="checkbox"
                        className="pv-check"
                        checked={visibleCols[c.key]}
                        onChange={() =>
                          setVisibleCols((v) => ({ ...v, [c.key]: !v[c.key] }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>

            <div className="pv-drawer-foot">
              <button className="btn" onClick={resetView}>
                Reset
              </button>
              <button
                className="btn btn-primary"
                onClick={saveView}
                disabled={viewSaving}
              >
                {viewSaving ? <Spinner /> : "Save"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="page-loading"><Spinner /></div>}>
      <BoardPage />
    </Suspense>
  );
}
