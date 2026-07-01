"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Member,
  Task,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskSeverity,
  Sprint,
  CustomFieldWithValue,
} from "@/lib/types";
import {
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TASK_TYPE_LABELS,
  TASK_TYPE_ORDER,
  TASK_SEVERITY_LABELS,
  TASK_SEVERITY_ORDER,
} from "@/lib/types";
import Spinner from "@/components/Spinner";
import DatePicker from "@/components/app/DatePicker";
import RichTextEditor from "@/components/app/RichTextEditor";
import Comments from "@/components/app/Comments";
import SelectField, { type SelectOption } from "@/components/app/SelectField";
import MemberPicker from "@/components/app/MemberPicker";
import LabelsField from "@/components/app/LabelsField";
import TaskStatusIcon from "@/components/app/TaskStatusIcon";
import PriorityIcon from "@/components/app/PriorityIcon";
import TaskTypeIcon from "@/components/app/TaskTypeIcon";
import { getCachedTaskDetail, setCachedTaskDetail } from "@/lib/task-cache";
import { useSprints, useMembers, useProjectTasks } from "@/lib/queries";

type ActivityMeta = {
  field: "status" | "priority" | "type";
  from: string | null;
  to: string | null;
};

type ActivityItem = {
  id: number;
  text: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_image: string | null;
  meta?: ActivityMeta | null;
};

type Detail = Task & {
  project_name: string;
  created_by_name?: string | null;
  created_by_image?: string | null;
  assignees?: string[];
  subtasks: LinkedItem[];
  linked_tasks?: LinkedItem[];
  linked_bugs?: LinkedItem[];
  custom_fields: CustomFieldWithValue[];
  activity?: ActivityItem[];
  parent?: { id: number; seq: number | null } | null;
};

type LinkedItem = Task & { assignees?: string[] };

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
const TYPE_OPTS: SelectOption[] = TASK_TYPE_ORDER.map((t) => ({
  value: t,
  label: TASK_TYPE_LABELS[t],
  icon: <TaskTypeIcon type={t} size={15} />,
}));
// Three ascending bars (matches the create-item modal's severity icon).
function SeverityBars({ level, color }: { level: number; color: string }) {
  const bars = [
    { x: 2, h: 5 },
    { x: 7, h: 9 },
    { x: 12, h: 13 },
  ];
  return (
    <svg className="status-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={15 - b.h}
          width="3"
          height={b.h}
          rx="1"
          fill={i < level ? color : "var(--border)"}
        />
      ))}
    </svg>
  );
}
const SEVERITY_ICONS: Record<TaskSeverity, ReactNode> = {
  critical: <SeverityBars level={3} color="#e5484d" />,
  major: <SeverityBars level={3} color="#f97316" />,
  moderate: <SeverityBars level={2} color="#38bdf8" />,
  low: <SeverityBars level={1} color="#16a34a" />,
};
const SEVERITY_OPTS: SelectOption[] = TASK_SEVERITY_ORDER.map((s) => ({
  value: s,
  label: TASK_SEVERITY_LABELS[s],
  icon: SEVERITY_ICONS[s],
}));

// Description has content if there's text OR embedded media (image/table/etc.),
// so an image-only description isn't treated as empty.
function hasRichContent(html: string | null | undefined) {
  if (!html) return false;
  if (/<(img|table|hr|iframe|video)/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

// Persisted collapse state for the detail-page sections (per section key).
function readOpen(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  const v = window.localStorage.getItem(`td-open-${key}`);
  return v == null ? def : v === "1";
}
function writeOpen(key: string, open: boolean) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`td-open-${key}`, open ? "1" : "0");
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Sprint icon (getflow — concentric spiral with goal marker).
function SprintIcon() {
  return (
    <svg className="td-sprint-ic" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M43.8643,15.954A21.4516,21.4516,0,1,1,32.4875,4.3209" />
      <path d="M33.2708,19.1921a10.4785,10.4785,0,1,1-4.4539-4.4582" />
      <path d="M27.0579,24.032a3.09,3.09,0,1,1-3.09-3.09" />
      <path d="M23.968,24.032,39.3741,8.6259" />
      <path d="M32.7052,15.2193v-6.05L39.3741,2.5V8.6259" />
      <path d="M32.7807,15.2948h6.05L45.5,8.6259H39.3741" />
    </svg>
  );
}

// A status/priority value rendered as its icon + label, for inline use in the
// activity log (e.g. "changed status from [icon] Backlog to [icon] In Test").
function ActivityValue({
  field,
  value,
}: {
  field: "status" | "priority" | "type";
  value: string | null;
}) {
  if (!value) return <>none</>;
  return (
    <span className="td-activity-val">
      {field === "status" ? (
        <TaskStatusIcon status={value as TaskStatus} size={14} />
      ) : field === "priority" ? (
        <PriorityIcon priority={value as TaskPriority} size={13} />
      ) : (
        <TaskTypeIcon type={value as TaskType} size={14} />
      )}
      {field === "status"
        ? STATUS_LABELS[value as TaskStatus] ?? value
        : field === "priority"
        ? PRIORITY_LABELS[value as TaskPriority] ?? value
        : TASK_TYPE_LABELS[value as TaskType] ?? value}
    </span>
  );
}

// Render an activity string, turning **…** segments into bold (used for names).
function renderActivityText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function fmtDateShort(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Single word → first two letters; otherwise first + last initial.
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function TaskDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();

  // If a list/board row warmed the cache on hover, render from it immediately
  // (then revalidate in the background) instead of showing a spinner.
  const cachedDetail = getCachedTaskDetail<Detail>(id);

  const [detail, setDetail] = useState<Detail | null>(cachedDetail ?? null);
  // Mirror of `detail` so drag handlers can read the latest order on drop.
  const detailRef = useRef<Detail | null>(null);
  detailRef.current = detail;
  // Project sprints + members come from the shared cache (same keys the board
  // and sprint views use), so they're already warm when a task opens.
  const sprintsQuery = useSprints<Sprint>(detail?.project_id ?? null);
  const membersQuery = useMembers(detail?.project_id ?? null);
  const sprints = sprintsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const [fieldVals, setFieldVals] = useState<Record<number, string>>(
    cachedDetail
      ? Object.fromEntries(
          (cachedDetail.custom_fields ?? []).map((f) => [f.id, f.value])
        )
      : {}
  );
  const [loading, setLoading] = useState(!cachedDetail);
  const [notFound, setNotFound] = useState(false);

  // Local edit buffers for free-text fields.
  const [title, setTitle] = useState(cachedDetail?.title ?? "");
  const [desc, setDesc] = useState(cachedDetail?.description ?? "");
  // Live value while dragging the progress slider (null = not dragging).
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  // Story Point is click-to-edit so its resting state shows just an icon/value.
  const [editingSP, setEditingSP] = useState(false);
  // Brief "Copied" feedback after clicking the Item ID.
  const [copiedId, setCopiedId] = useState(false);
  // Activity section tabs.
  const [activityTab, setActivityTab] = useState<
    "activity" | "comments" | "time"
  >("activity");
  // Newest-first vs oldest-first for the Activity / Comments feeds.
  const [sortNewest, setSortNewest] = useState(true);
  const [newSub, setNewSub] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [addSubOpen, setAddSubOpen] = useState(false);
  const subPickerRef = useRef<HTMLDivElement>(null);
  const subInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [titleFocused, setTitleFocused] = useState(false);
  // Collapsible left-column sections — persisted so they survive a refresh.
  const [openSub, setOpenSub] = useState(() => readOpen("sub", true));
  const [openAtt, setOpenAtt] = useState(() => readOpen("att", true));
  // Linked-tasks section (only shown for Story items).
  const [openTasks, setOpenTasks] = useState(() => readOpen("tasks", true));
  const [linkTaskOpen, setLinkTaskOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const linkPickerRef = useRef<HTMLDivElement>(null);
  const [linkBugOpen, setLinkBugOpen] = useState(false);
  const [bugSearch, setBugSearch] = useState("");
  const [creatingBug, setCreatingBug] = useState(false);
  const bugPickerRef = useRef<HTMLDivElement>(null);
  // Row being unlinked: shows a loader, then animates out before refresh.
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const [exitingId, setExitingId] = useState<number | null>(null);
  // Newly added/linked row: plays an entrance animation.
  const [enteringId, setEnteringId] = useState<number | null>(null);
  // Briefly pops the just-changed status/priority value.
  const [flash, setFlash] = useState<{ id: number; field: string } | null>(
    null
  );
  // Drag-to-reorder: ids of the row being dragged and the current drop target.
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  // Linked-bugs section (shown for Story/Task items).
  const [openBugs, setOpenBugs] = useState(() => readOpen("bugs", true));
  // Candidate tasks to link (Story/Task items only) — shared project-tasks cache.
  const projectTasksQuery = useProjectTasks<LinkedItem>(
    detail && (detail.type === "story" || detail.type === "task")
      ? detail.project_id
      : null
  );
  const projectTasks = projectTasksQuery.data ?? [];
  // Description is collapsible + click-to-edit (editor + Save while editing).
  const [openDesc, setOpenDesc] = useState(() => readOpen("desc", true));
  const [editingDesc, setEditingDesc] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);

  // Persist section collapse state across refreshes.
  useEffect(() => writeOpen("desc", openDesc), [openDesc]);
  useEffect(() => writeOpen("sub", openSub), [openSub]);
  useEffect(() => writeOpen("att", openAtt), [openAtt]);
  useEffect(() => writeOpen("tasks", openTasks), [openTasks]);
  useEffect(() => writeOpen("bugs", openBugs), [openBugs]);

  // Close the link-task search picker when clicking outside it.
  useEffect(() => {
    if (!linkTaskOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        linkPickerRef.current &&
        !linkPickerRef.current.contains(e.target as Node)
      ) {
        setLinkTaskOpen(false);
        setTaskSearch("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [linkTaskOpen]);

  useEffect(() => {
    if (!linkBugOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        bugPickerRef.current &&
        !bugPickerRef.current.contains(e.target as Node)
      ) {
        setLinkBugOpen(false);
        setBugSearch("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [linkBugOpen]);

  // Close the add-subtask picker when clicking outside it.
  useEffect(() => {
    if (!addSubOpen) return;
    const onDown = (e: MouseEvent) => {
      if (
        subPickerRef.current &&
        !subPickerRef.current.contains(e.target as Node)
      ) {
        setAddSubOpen(false);
        setNewSub("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [addSubOpen]);

  // Auto-size the title textarea to its content (grows to a second line).
  function autoGrowTitle(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }
  useEffect(() => {
    if (titleRef.current) autoGrowTitle(titleRef.current);
  }, [title]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const data: Detail = await res.json();
    setCachedTaskDetail(id, data);
    setDetail(data);
    setTitle(data.title);
    setDesc(data.description);
    setFieldVals(
      Object.fromEntries((data.custom_fields ?? []).map((f) => [f.id, f.value]))
    );
  }, [id]);

  async function saveFieldValue(fieldId: number, value: string) {
    setFieldVals((v) => ({ ...v, [fieldId]: value }));
    await fetch("/api/custom-fields/value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: id, field_id: fieldId, value }),
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Briefly flag a row so it plays its entrance animation after refresh.
  function flagEntering(taskId: number) {
    setEnteringId(taskId);
    window.setTimeout(() => setEnteringId(null), 400);
  }

  // Link/unlink an existing task to this story, then refresh.
  async function linkTask(taskId: number) {
    if (!detail) return;
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: detail.id }),
    });
    await load();
    flagEntering(taskId);
  }
  async function unlinkTask(taskId: number) {
    setUnlinkingId(taskId);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story_id: null }),
    });
    // Soft fade/collapse out, then refresh the list.
    setExitingId(taskId);
    await new Promise((r) => window.setTimeout(r, 280));
    await load();
    setUnlinkingId(null);
    setExitingId(null);
  }

  // Create a brand-new task with the typed title and link it to this story.
  async function createAndLinkTask(title: string) {
    if (!detail || !title.trim() || creatingTask) return;
    setCreatingTask(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: detail.project_id,
        title: title.trim(),
        type: "task",
      }),
    });
    let createdId: number | null = null;
    if (res.ok) {
      const created: Task = await res.json();
      createdId = created.id;
      await fetch(`/api/tasks/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_id: detail.id }),
      });
    }
    await load();
    setCreatingTask(false);
    setLinkTaskOpen(false);
    setTaskSearch("");
    if (createdId != null) flagEntering(createdId);
  }

  // Update a field on a linked task/bug from its row, then refresh + pop it.
  async function updateLinkedField(taskId: number, body: Partial<Task>) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
    setFlash({ id: taskId, field: Object.keys(body)[0] });
    window.setTimeout(() => setFlash(null), 600);
  }

  // Link/unlink an existing bug to this story/task, then refresh.
  async function linkBug(bugId: number) {
    if (!detail) return;
    await fetch(`/api/tasks/${bugId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linked_to: detail.id }),
    });
    await load();
    flagEntering(bugId);
  }
  async function unlinkBug(bugId: number) {
    setUnlinkingId(bugId);
    await fetch(`/api/tasks/${bugId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linked_to: null }),
    });
    setExitingId(bugId);
    await new Promise((r) => window.setTimeout(r, 280));
    await load();
    setUnlinkingId(null);
    setExitingId(null);
  }

  // Create a brand-new bug with the typed title and link it to this item.
  async function createAndLinkBug(title: string) {
    if (!detail || !title.trim() || creatingBug) return;
    setCreatingBug(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: detail.project_id,
        title: title.trim(),
        type: "bug",
      }),
    });
    let createdId: number | null = null;
    if (res.ok) {
      const created: Task = await res.json();
      createdId = created.id;
      await fetch(`/api/tasks/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_to: detail.id }),
      });
    }
    await load();
    setCreatingBug(false);
    setLinkBugOpen(false);
    setBugSearch("");
    if (createdId != null) flagEntering(createdId);
  }

  // Feed the topbar breadcrumb: Project › [Parent Item] › Item ID.
  useEffect(() => {
    if (!detail) return;
    const prefix =
      detail.project_name
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 3)
        .toUpperCase() || "TSK";
    const code = (seq: number | null) =>
      seq != null ? `${prefix}-${String(seq).padStart(3, "0")}` : null;
    const crumbId = code(detail.seq) ?? detail.title;
    const parent =
      detail.parent && code(detail.parent.seq)
        ? { id: detail.parent.id, task: code(detail.parent.seq)! }
        : null;
    window.dispatchEvent(
      new CustomEvent("tb:task-crumb", {
        detail: {
          project: detail.project_name,
          projectId: detail.project_id,
          task: crumbId,
          parent,
        },
      })
    );
    return () => {
      window.dispatchEvent(new CustomEvent("tb:task-crumb", { detail: null }));
    };
  }, [
    detail?.project_name,
    detail?.project_id,
    detail?.title,
    detail?.seq,
    detail?.parent?.id,
    detail?.parent?.seq,
  ]);

  // Patch the main task and merge the result back.
  async function patch(fields: Partial<Task>) {
    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      // Response includes the refreshed activity log so sidebar edits show up
      // in the Activity section immediately.
      const updated: Task & { activity?: ActivityItem[] } = await res.json();
      setDetail((d) => (d ? { ...d, ...updated } : d));
    }
  }

  // Create a brand-new subtask under this item, then refresh + pop it.
  async function createSubtask(title: string) {
    const t = title.trim();
    if (!t || !detail || addingSub) return;
    setAddingSub(true);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: detail.project_id,
        parent_id: detail.id,
        title: t,
      }),
    });
    let createdId: number | null = null;
    if (res.ok) {
      const created: Task = await res.json();
      createdId = created.id;
    }
    await load();
    setAddingSub(false);
    setNewSub("");
    // Keep the picker open and refocus so multiple subtasks can be added.
    requestAnimationFrame(() => subInputRef.current?.focus());
    if (createdId != null) flagEntering(createdId);
  }

  // --- Drag-to-reorder for the linked-task/bug/subtask lists ---
  type ListKey = "linked_tasks" | "linked_bugs" | "subtasks";

  // Live (optimistic) reorder while dragging — moves `fromId` to `overId`'s slot.
  function moveRow(key: ListKey, fromId: number, overId: number) {
    if (fromId === overId) return;
    setDetail((d) => {
      if (!d) return d;
      const list = [...((d[key] as LinkedItem[] | undefined) ?? [])];
      const from = list.findIndex((x) => x.id === fromId);
      const to = list.findIndex((x) => x.id === overId);
      if (from === -1 || to === -1 || from === to) return d;
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { ...d, [key]: list } as Detail;
    });
  }

  // Persist the current order of a list once the drop completes.
  function persistOrder(key: ListKey) {
    const list = (detailRef.current?.[key] as LinkedItem[] | undefined) ?? [];
    if (!list.length) return;
    fetch("/api/tasks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: list.map((x) => x.id) }),
    }).catch(() => {});
  }

  async function deleteSub(sub: LinkedItem) {
    setUnlinkingId(sub.id);
    await fetch(`/api/tasks/${sub.id}`, { method: "DELETE" });
    // Soft fade/collapse out, then refresh the list.
    setExitingId(sub.id);
    await new Promise((r) => window.setTimeout(r, 280));
    await load();
    setUnlinkingId(null);
    setExitingId(null);
  }

  async function deleteTask() {
    if (!detail) return;
    if (!window.confirm(`Delete "${detail.title}" and its subtasks?`)) return;
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    router.push(`/?project=${detail.project_id}`);
  }

  if (loading) {
    return (
      <div className="page-loading">
        <Spinner />
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="empty-state">
        <div className="empty-card">
          <h2>Task Not Found</h2>
          <p>This task may have been deleted.</p>
          <div className="empty-card-actions">
            <Link className="btn btn-primary" href="/">
              Back to board
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Human item id, e.g. DEV-001 (3-char project prefix + zero-padded seq).
  const projectPrefix =
    detail.project_name
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase() || "TSK";
  const taskCode = (seq: number | null) =>
    seq != null ? `${projectPrefix}-${String(seq).padStart(3, "0")}` : null;
  const itemId = taskCode(detail.seq);

  const subDone = detail.subtasks.filter((s) => s.status === "done").length;
  // Derived progress = completed subtasks; a Done task counts as 100%.
  const derivedProgress =
    detail.status === "done"
      ? 100
      : detail.subtasks.length
      ? Math.round((subDone / detail.subtasks.length) * 100)
      : 0;
  // A manually-set value (detail.progress) overrides the derived one; while the
  // slider is being dragged, show the live drag value.
  const progress =
    dragProgress != null
      ? dragProgress
      : detail.progress != null
      ? detail.progress
      : derivedProgress;

  return (
    <div className="task-detail">
      <div className="td-grid">
        <div className="td-main">
          <div className="td-title-wrap">
            <textarea
              ref={titleRef}
              className="td-title"
              value={title}
              rows={1}
              maxLength={128}
              onChange={(e) => {
                setTitle(e.target.value);
                autoGrowTitle(e.currentTarget);
              }}
              onFocus={() => setTitleFocused(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              onBlur={() => {
                setTitleFocused(false);
                const v = title.trim();
                if (v && v !== detail.title) patch({ title: v });
                else setTitle(detail.title);
              }}
              placeholder="Enter your item title"
            />
            {titleFocused && (
              <span className="td-title-count">{title.length}/128</span>
            )}
          </div>
          <div className="td-main-scroll">
          <div className="td-section-head">
            <button
              type="button"
              className="td-section-toggle"
              onClick={() => setOpenDesc((o) => !o)}
            >
              <svg className={`td-caret${openDesc ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
              Description
            </button>
          </div>
          {openDesc &&
            (editingDesc ? (
            <div className="td-desc-edit">
              <RichTextEditor
                value={desc}
                onChange={setDesc}
                placeholder="Add a description…"
                toolbarBottom
                autoFocus
              />
              <div className="td-desc-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setDesc(detail.description);
                    setEditingDesc(false);
                  }}
                  disabled={savingDesc}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={savingDesc}
                  onClick={async () => {
                    setSavingDesc(true);
                    if (desc !== detail.description)
                      await patch({ description: desc });
                    setSavingDesc(false);
                    setEditingDesc(false);
                  }}
                >
                  {savingDesc ? <Spinner /> : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="td-desc-view"
              role="button"
              tabIndex={0}
              onClick={() => {
                setDesc(detail.description);
                setEditingDesc(true);
              }}
            >
              {hasRichContent(detail.description) ? (
                <div
                  className="td-desc-content"
                  dangerouslySetInnerHTML={{ __html: detail.description }}
                />
              ) : (
                <span className="td-desc-placeholder">Click here to add description</span>
              )}
            </div>
            ))}

          {detail.custom_fields.length > 0 && (
            <div className="td-fields">
              {detail.custom_fields.map((f) => (
                <div className="td-field-row" key={f.id}>
                  <span className="td-field-name">{f.name}</span>
                  {f.type === "select" ? (
                    <select
                      className="td-field-input"
                      value={fieldVals[f.id] ?? ""}
                      onChange={(e) => saveFieldValue(f.id, e.target.value)}
                    >
                      <option value="">—</option>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "date" ? (
                    <div className="td-field-input-wrap">
                      <DatePicker
                        value={fieldVals[f.id] ?? ""}
                        onChange={(v) => saveFieldValue(f.id, v)}
                        placeholder="Select date"
                      />
                    </div>
                  ) : (
                    <input
                      className="td-field-input"
                      type={f.type === "number" ? "number" : "text"}
                      value={fieldVals[f.id] ?? ""}
                      onChange={(e) =>
                        setFieldVals((v) => ({ ...v, [f.id]: e.target.value }))
                      }
                      onBlur={(e) => saveFieldValue(f.id, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {detail.type === "story" && (
            <>
              <div className="td-section-head">
                <button
                  type="button"
                  className="td-section-toggle"
                  onClick={() => setOpenTasks((o) => !o)}
                >
                  <svg className={`td-caret${openTasks ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  Task
                  <span className="td-section-count">
                    {detail.linked_tasks?.length ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  className="td-section-add"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setOpenTasks(true);
                    setLinkTaskOpen((o) => !o);
                  }}
                  aria-label="Link a task"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              {openTasks && (
                <>
                  {linkTaskOpen && (
                    <div className="td-link-picker" ref={linkPickerRef}>
                      <div className="td-link-search-wrap">
                        <input
                          className="td-link-search"
                          autoFocus
                          maxLength={128}
                          placeholder="Search task…"
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && taskSearch.trim()) {
                              e.preventDefault();
                              createAndLinkTask(taskSearch);
                            } else if (e.key === "Escape") {
                              setLinkTaskOpen(false);
                              setTaskSearch("");
                            }
                          }}
                        />
                        {taskSearch.trim() && (
                          <span className="td-link-count">
                            {taskSearch.length}/128
                          </span>
                        )}
                      </div>
                      <ul className="td-link-list">
                        {projectTasks
                          .filter(
                            (t) =>
                              t.type === "task" &&
                              t.story_id !== detail.id &&
                              t.title
                                .toLowerCase()
                                .includes(taskSearch.toLowerCase())
                          )
                          .map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                className="td-link-option"
                                onClick={() => {
                                  linkTask(t.id);
                                  setLinkTaskOpen(false);
                                  setTaskSearch("");
                                }}
                              >
                                <TaskStatusIcon status={t.status} size={14} />
                                <span className="td-link-title">{t.title}</span>
                                <span className="sub-meta">
                                  {t.due_date && (
                                    <span className="sub-due">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <rect x="3" y="6" width="13" height="13" rx="2.5" />
                                        <path d="M3 10h13" />
                                      </svg>
                                      {fmtDateShort(t.due_date)}
                                    </span>
                                  )}
                                  {t.assignees?.[0] && (
                                    <span className="sub-assignee">
                                      {initials(
                                        members.find(
                                          (m) => m.user_id === t.assignees![0]
                                        )?.name
                                      )}
                                    </span>
                                  )}
                                  <PriorityIcon priority={t.priority} size={14} />
                                </span>
                              </button>
                            </li>
                          ))}
                        {taskSearch.trim() && (
                          <li>
                            <button
                              type="button"
                              className="td-link-option td-link-create"
                              disabled={creatingTask}
                              onClick={() => createAndLinkTask(taskSearch)}
                            >
                              {creatingTask ? (
                                <span className="sub-spinner" aria-label="Adding">
                                  <span />
                                  <span />
                                  <span />
                                </span>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 5v14M5 12h14" />
                                </svg>
                              )}
                              <span className="td-link-title">
                                {creatingTask
                                  ? "Adding…"
                                  : `Add "${taskSearch.trim()}"`}
                              </span>
                            </button>
                          </li>
                        )}
                        {!taskSearch.trim() &&
                          projectTasks.filter(
                            (t) =>
                              t.type === "task" && t.story_id !== detail.id
                          ).length === 0 && (
                            <li className="td-link-empty">No tasks found</li>
                          )}
                      </ul>
                    </div>
                  )}
                  <ul className="subtask-list">
                    {(detail.linked_tasks ?? []).map((t) => (
                      <li
                        key={t.id}
                        className={`subtask${
                          unlinkingId === t.id ? " is-unlinking" : ""
                        }${exitingId === t.id ? " is-exiting" : ""}${
                          enteringId === t.id ? " is-entering" : ""
                        }${dragId === t.id ? " is-dragging" : ""}${
                          dragOverId === t.id && dragId !== t.id
                            ? " is-drop-target"
                            : ""
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragId !== null && dragId !== t.id)
                            setDragOverId(t.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId !== null) moveRow("linked_tasks", dragId, t.id);
                          setDragOverId(null);
                        }}
                      >
                        <button
                          type="button"
                          className="sub-drag"
                          draggable
                          onDragStart={(e) => {
                            setDragId(t.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            persistOrder("linked_tasks");
                            setDragId(null);
                            setDragOverId(null);
                          }}
                          aria-label="Drag to reorder"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="9" cy="6" r="1.6" />
                            <circle cx="15" cy="6" r="1.6" />
                            <circle cx="9" cy="12" r="1.6" />
                            <circle cx="15" cy="12" r="1.6" />
                            <circle cx="9" cy="18" r="1.6" />
                            <circle cx="15" cy="18" r="1.6" />
                          </svg>
                        </button>
                        <span
                          className={`sf-flash${
                            flash?.id === t.id && flash.field === "status"
                              ? " flash"
                              : ""
                          }`}
                        >
                          <SelectField
                            inline
                            iconOnly
                            value={t.status}
                            options={STATUS_OPTS}
                            onChange={(v) =>
                              updateLinkedField(t.id, {
                                status: v as TaskStatus,
                              })
                            }
                          />
                        </span>
                        {taskCode(t.seq) && (
                          <span className="sub-id">{taskCode(t.seq)}</span>
                        )}
                        <Link href={`/task/${t.id}`} className="sub-title">
                          {t.title}
                        </Link>
                        <span className="sub-meta">
                          <DatePicker
                            inline
                            quick
                            value={t.due_date ?? ""}
                            onChange={(v) =>
                              updateLinkedField(t.id, { due_date: v || null })
                            }
                          />
                          <MemberPicker
                            inline
                            multiple
                            members={members}
                            value={t.assignees ?? []}
                            onChange={(ids) =>
                              updateLinkedField(t.id, {
                                assignees: ids,
                              } as Partial<Task>)
                            }
                            placeholder="Assign"
                          />
                          <span
                            className={`sf-flash${
                              flash?.id === t.id && flash.field === "priority"
                                ? " flash"
                                : ""
                            }`}
                          >
                            <SelectField
                              inline
                              iconOnly
                              value={t.priority}
                              options={PRIORITY_OPTS}
                              onChange={(v) =>
                                updateLinkedField(t.id, {
                                  priority: v as TaskPriority,
                                })
                              }
                            />
                          </span>
                        </span>
                        {unlinkingId === t.id ? (
                          <span className="sub-spinner" aria-label="Removing">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          <button
                            className="sub-del"
                            onClick={() => unlinkTask(t.id)}
                            aria-label="Unlink task"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          {(detail.type === "story" || detail.type === "task") && (
            <>
              <div className="td-section-head">
                <button
                  type="button"
                  className="td-section-toggle"
                  onClick={() => setOpenBugs((o) => !o)}
                >
                  <svg className={`td-caret${openBugs ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  Bug
                  <span className="td-section-count">
                    {detail.linked_bugs?.length ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  className="td-section-add"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    setOpenBugs(true);
                    setLinkBugOpen((o) => !o);
                  }}
                  aria-label="Link a bug"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              {openBugs && (
                <>
                  {linkBugOpen && (
                    <div className="td-link-picker" ref={bugPickerRef}>
                      <div className="td-link-search-wrap">
                        <input
                          className="td-link-search"
                          autoFocus
                          maxLength={128}
                          placeholder="Search bug…"
                          value={bugSearch}
                          onChange={(e) => setBugSearch(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && bugSearch.trim()) {
                              e.preventDefault();
                              createAndLinkBug(bugSearch);
                            } else if (e.key === "Escape") {
                              setLinkBugOpen(false);
                              setBugSearch("");
                            }
                          }}
                        />
                        {bugSearch.trim() && (
                          <span className="td-link-count">
                            {bugSearch.length}/128
                          </span>
                        )}
                      </div>
                      <ul className="td-link-list">
                        {projectTasks
                          .filter(
                            (t) =>
                              t.type === "bug" &&
                              t.linked_to !== detail.id &&
                              t.title
                                .toLowerCase()
                                .includes(bugSearch.toLowerCase())
                          )
                          .map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                className="td-link-option"
                                onClick={() => {
                                  linkBug(t.id);
                                  setLinkBugOpen(false);
                                  setBugSearch("");
                                }}
                              >
                                <TaskStatusIcon status={t.status} size={14} />
                                <span className="td-link-title">{t.title}</span>
                                <span className="sub-meta">
                                  {t.due_date && (
                                    <span className="sub-due">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <rect x="3" y="6" width="13" height="13" rx="2.5" />
                                        <path d="M3 10h13" />
                                      </svg>
                                      {fmtDateShort(t.due_date)}
                                    </span>
                                  )}
                                  {t.assignees?.[0] && (
                                    <span className="sub-assignee">
                                      {initials(
                                        members.find(
                                          (m) => m.user_id === t.assignees![0]
                                        )?.name
                                      )}
                                    </span>
                                  )}
                                  <PriorityIcon priority={t.priority} size={14} />
                                </span>
                              </button>
                            </li>
                          ))}
                        {bugSearch.trim() && (
                          <li>
                            <button
                              type="button"
                              className="td-link-option td-link-create"
                              disabled={creatingBug}
                              onClick={() => createAndLinkBug(bugSearch)}
                            >
                              {creatingBug ? (
                                <span className="sub-spinner" aria-label="Adding">
                                  <span />
                                  <span />
                                  <span />
                                </span>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M12 5v14M5 12h14" />
                                </svg>
                              )}
                              <span className="td-link-title">
                                {creatingBug
                                  ? "Adding…"
                                  : `Add "${bugSearch.trim()}"`}
                              </span>
                            </button>
                          </li>
                        )}
                        {!bugSearch.trim() &&
                          projectTasks.filter(
                            (t) =>
                              t.type === "bug" && t.linked_to !== detail.id
                          ).length === 0 && (
                            <li className="td-link-empty">No bugs found</li>
                          )}
                      </ul>
                    </div>
                  )}
                  <ul className="subtask-list">
                    {(detail.linked_bugs ?? []).map((b) => (
                      <li
                        key={b.id}
                        className={`subtask${
                          unlinkingId === b.id ? " is-unlinking" : ""
                        }${exitingId === b.id ? " is-exiting" : ""}${
                          enteringId === b.id ? " is-entering" : ""
                        }${dragId === b.id ? " is-dragging" : ""}${
                          dragOverId === b.id && dragId !== b.id
                            ? " is-drop-target"
                            : ""
                        }`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragId !== null && dragId !== b.id)
                            setDragOverId(b.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragId !== null) moveRow("linked_bugs", dragId, b.id);
                          setDragOverId(null);
                        }}
                      >
                        <button
                          type="button"
                          className="sub-drag"
                          draggable
                          onDragStart={(e) => {
                            setDragId(b.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            persistOrder("linked_bugs");
                            setDragId(null);
                            setDragOverId(null);
                          }}
                          aria-label="Drag to reorder"
                        >
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="9" cy="6" r="1.6" />
                            <circle cx="15" cy="6" r="1.6" />
                            <circle cx="9" cy="12" r="1.6" />
                            <circle cx="15" cy="12" r="1.6" />
                            <circle cx="9" cy="18" r="1.6" />
                            <circle cx="15" cy="18" r="1.6" />
                          </svg>
                        </button>
                        <span
                          className={`sf-flash${
                            flash?.id === b.id && flash.field === "status"
                              ? " flash"
                              : ""
                          }`}
                        >
                          <SelectField
                            inline
                            iconOnly
                            value={b.status}
                            options={STATUS_OPTS}
                            onChange={(v) =>
                              updateLinkedField(b.id, {
                                status: v as TaskStatus,
                              })
                            }
                          />
                        </span>
                        {taskCode(b.seq) && (
                          <span className="sub-id">{taskCode(b.seq)}</span>
                        )}
                        <Link href={`/task/${b.id}`} className="sub-title">
                          {b.title}
                        </Link>
                        <span className="sub-meta">
                          <DatePicker
                            inline
                            quick
                            value={b.due_date ?? ""}
                            onChange={(v) =>
                              updateLinkedField(b.id, { due_date: v || null })
                            }
                          />
                          <MemberPicker
                            inline
                            multiple
                            members={members}
                            value={b.assignees ?? []}
                            onChange={(ids) =>
                              updateLinkedField(b.id, {
                                assignees: ids,
                              } as Partial<Task>)
                            }
                            placeholder="Assign"
                          />
                          <span
                            className={`sf-flash${
                              flash?.id === b.id && flash.field === "priority"
                                ? " flash"
                                : ""
                            }`}
                          >
                            <SelectField
                              inline
                              iconOnly
                              value={b.priority}
                              options={PRIORITY_OPTS}
                              onChange={(v) =>
                                updateLinkedField(b.id, {
                                  priority: v as TaskPriority,
                                })
                              }
                            />
                          </span>
                        </span>
                        {unlinkingId === b.id ? (
                          <span className="sub-spinner" aria-label="Removing">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          <button
                            className="sub-del"
                            onClick={() => unlinkBug(b.id)}
                            aria-label="Unlink bug"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}

          <div className="td-section-head">
            <button
              type="button"
              className="td-section-toggle"
              onClick={() => setOpenSub((o) => !o)}
            >
              <svg className={`td-caret${openSub ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
              Sub Task
              <span className="td-section-count">{detail.subtasks.length}</span>
            </button>
            <button
              type="button"
              className="td-section-add"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                setOpenSub(true);
                setAddSubOpen((o) => !o);
              }}
              aria-label="Add a subtask"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          {openSub && (
            <>
              {addSubOpen && (
                <div className="td-link-picker" ref={subPickerRef}>
                  <div className="td-link-search-wrap">
                    <input
                      ref={subInputRef}
                      className="td-link-search"
                      autoFocus
                      maxLength={128}
                      placeholder="Add a subtask…"
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newSub.trim()) {
                          e.preventDefault();
                          createSubtask(newSub);
                        } else if (e.key === "Escape") {
                          setAddSubOpen(false);
                          setNewSub("");
                        }
                      }}
                    />
                    <span className="td-link-count">{newSub.length}/128</span>
                  </div>
                  {newSub.trim() && (
                    <ul className="td-link-list">
                      <li>
                        <button
                          type="button"
                          className="td-link-option td-link-create"
                          disabled={addingSub}
                          onClick={() => createSubtask(newSub)}
                        >
                          {addingSub ? (
                            <span className="sub-spinner" aria-label="Adding">
                              <span />
                              <span />
                              <span />
                            </span>
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          )}
                          <span className="td-link-title">
                            {addingSub ? "Adding…" : `Add "${newSub.trim()}"`}
                          </span>
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              )}
              <ul className="subtask-list">
                {detail.subtasks.map((s) => (
                  <li
                    key={s.id}
                    className={`subtask${
                      unlinkingId === s.id ? " is-unlinking" : ""
                    }${exitingId === s.id ? " is-exiting" : ""}${
                      enteringId === s.id ? " is-entering" : ""
                    }${dragId === s.id ? " is-dragging" : ""}${
                      dragOverId === s.id && dragId !== s.id
                        ? " is-drop-target"
                        : ""
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragId !== null && dragId !== s.id) setDragOverId(s.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragId !== null) moveRow("subtasks", dragId, s.id);
                      setDragOverId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="sub-drag"
                      draggable
                      onDragStart={(e) => {
                        setDragId(s.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        persistOrder("subtasks");
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      aria-label="Drag to reorder"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <circle cx="9" cy="6" r="1.6" />
                        <circle cx="15" cy="6" r="1.6" />
                        <circle cx="9" cy="12" r="1.6" />
                        <circle cx="15" cy="12" r="1.6" />
                        <circle cx="9" cy="18" r="1.6" />
                        <circle cx="15" cy="18" r="1.6" />
                      </svg>
                    </button>
                    <span
                      className={`sf-flash${
                        flash?.id === s.id && flash.field === "status"
                          ? " flash"
                          : ""
                      }`}
                    >
                      <SelectField
                        inline
                        iconOnly
                        value={s.status}
                        options={STATUS_OPTS}
                        onChange={(v) =>
                          updateLinkedField(s.id, {
                            status: v as TaskStatus,
                          })
                        }
                      />
                    </span>
                    {taskCode(s.seq) && (
                      <span className="sub-id">{taskCode(s.seq)}</span>
                    )}
                    <Link href={`/task/${s.id}`} className="sub-title">
                      {s.title}
                    </Link>
                    <span className="sub-meta">
                      <DatePicker
                        inline
                        quick
                        value={s.due_date ?? ""}
                        onChange={(v) =>
                          updateLinkedField(s.id, { due_date: v || null })
                        }
                      />
                      <MemberPicker
                        inline
                        multiple
                        members={members}
                        value={s.assignees ?? []}
                        onChange={(ids) =>
                          updateLinkedField(s.id, {
                            assignees: ids,
                          } as Partial<Task>)
                        }
                        placeholder="Assign"
                      />
                      <span
                        className={`sf-flash${
                          flash?.id === s.id && flash.field === "priority"
                            ? " flash"
                            : ""
                        }`}
                      >
                        <SelectField
                          inline
                          iconOnly
                          value={s.priority}
                          options={PRIORITY_OPTS}
                          onChange={(v) =>
                            updateLinkedField(s.id, {
                              priority: v as TaskPriority,
                            })
                          }
                        />
                      </span>
                    </span>
                    {unlinkingId === s.id ? (
                      <span className="sub-spinner" aria-label="Removing">
                        <span />
                        <span />
                        <span />
                      </span>
                    ) : (
                      <button
                        className="sub-del"
                        onClick={() => deleteSub(s)}
                        aria-label="Delete subtask"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="td-section-head">
            <button
              type="button"
              className="td-section-toggle"
              onClick={() => setOpenAtt((o) => !o)}
            >
              <svg className={`td-caret${openAtt ? " open" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m9 18 6-6-6-6" />
              </svg>
              Attachments
              <span className="td-section-count">0</span>
            </button>
          </div>
          {openAtt && (
            <div className="td-att-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span>Attachments — coming soon</span>
            </div>
          )}
          </div>

          <div className="td-activity">
            <div className="td-tabs-row">
              <div className="td-tabs">
                <button
                  type="button"
                  className={`td-tab${activityTab === "activity" ? " active" : ""}`}
                  onClick={() => setActivityTab("activity")}
                >
                  Activity
                </button>
                <button
                  type="button"
                  className={`td-tab${activityTab === "comments" ? " active" : ""}`}
                  onClick={() => setActivityTab("comments")}
                >
                  Comments
                </button>
                <button
                  type="button"
                  className={`td-tab${activityTab === "time" ? " active" : ""}`}
                  onClick={() => setActivityTab("time")}
                >
                  Time Entry
                </button>
              </div>
              {activityTab !== "time" && (
                <button
                  type="button"
                  className="td-sort"
                  onClick={() => setSortNewest((s) => !s)}
                  title={sortNewest ? "Showing newest first" : "Showing oldest first"}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 6h13M4 12h9M4 18h5" />
                  </svg>
                  {sortNewest ? "Newest First" : "Oldest First"}
                </button>
              )}
            </div>
            <div className="td-tab-panel">
              {activityTab === "activity" &&
                (detail.activity && detail.activity.length ? (
                  <ul className="td-activity-list">
                    {[...detail.activity]
                      .sort((a, b) => {
                        const d =
                          a.created_at < b.created_at
                            ? -1
                            : a.created_at > b.created_at
                            ? 1
                            : a.id - b.id;
                        return sortNewest ? -d : d;
                      })
                      .map((a) => (
                      <li key={a.id} className="td-activity-item">
                        <span className="td-activity-avatar">
                          {a.actor_image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.actor_image} alt="" />
                          ) : (
                            initials(a.actor_name)
                          )}
                        </span>
                        <div className="td-activity-body">
                          <span className="td-activity-text">
                            <strong>{a.actor_name ?? "Someone"}</strong>{" "}
                            {a.meta ? (
                              <>
                                changed {a.meta.field} from{" "}
                                <ActivityValue
                                  field={a.meta.field}
                                  value={a.meta.from}
                                />{" "}
                                to{" "}
                                <ActivityValue
                                  field={a.meta.field}
                                  value={a.meta.to}
                                />
                              </>
                            ) : (
                              renderActivityText(a.text)
                            )}
                          </span>
                          <span className="td-activity-time">
                            {fmtDateTime(a.created_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="td-tab-empty">No activity yet</div>
                ))}
              {activityTab === "comments" && (
                <Comments
                  taskId={id}
                  members={members}
                  sortNewest={sortNewest}
                />
              )}
              {activityTab === "time" && (
                <div className="td-tab-empty">No time entries yet</div>
              )}
            </div>
          </div>
        </div>

        <aside className="td-side">
          <div className="td-prop-progress">
            <span className="td-prop-section">Progress</span>
            <div className="td-progress">
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                className="td-progress-slider"
                style={{ "--td-progress": `${progress}%` } as CSSProperties}
                onChange={(e) => setDragProgress(Number(e.target.value))}
                onPointerUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  // Update detail optimistically before clearing the drag value
                  // so it doesn't briefly snap back to the old value.
                  setDetail((d) => (d ? { ...d, progress: v } : d));
                  setDragProgress(null);
                  patch({ progress: v });
                }}
                onKeyUp={(e) => {
                  const v = Number((e.target as HTMLInputElement).value);
                  setDetail((d) => (d ? { ...d, progress: v } : d));
                  setDragProgress(null);
                  patch({ progress: v });
                }}
                aria-label="Progress"
              />
              <span className="td-progress-pct">{progress}%</span>
            </div>
          </div>

          <span className="td-prop-section">Properties</span>
          <div className="td-props">
            <div className="td-prop">
              <span className="td-prop-k">Item Type</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={detail.type}
                  options={TYPE_OPTS}
                  onChange={(v) => patch({ type: v as TaskType })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Item ID</span>
              <span className="td-prop-v td-prop-ro">
                <svg className="td-created-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
                </svg>
                {itemId ? (
                  <button
                    type="button"
                    className="td-id-copy"
                    onClick={() => {
                      navigator.clipboard?.writeText(itemId);
                      setCopiedId(true);
                      window.setTimeout(() => setCopiedId(false), 1400);
                    }}
                  >
                    {itemId}
                    {copiedId && <span className="td-id-copied">Copied</span>}
                  </button>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Start Date</span>
              <span className="td-prop-v">
                <DatePicker
                  inline
                  quick
                  value={detail.start_date ?? ""}
                  max={detail.due_date || undefined}
                  onChange={(v) => patch({ start_date: v || null })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Due Date</span>
              <span className="td-prop-v">
                <DatePicker
                  inline
                  quick
                  value={detail.due_date ?? ""}
                  min={detail.start_date || undefined}
                  onChange={(v) => patch({ due_date: v || null })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Assigned to</span>
              <span className="td-prop-v">
                <MemberPicker
                  inline
                  multiple
                  members={members}
                  value={detail.assignees ?? []}
                  onChange={(ids) => patch({ assignees: ids } as Partial<Task>)}
                  placeholder="Assign"
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Status</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={detail.status}
                  options={STATUS_OPTS}
                  onChange={(v) => patch({ status: v as TaskStatus })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Priority</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={detail.priority}
                  options={PRIORITY_OPTS}
                  onChange={(v) => patch({ priority: v as TaskPriority })}
                />
              </span>
            </div>
            {detail.type === "bug" && (
              <div className="td-prop">
                <span className="td-prop-k">Severity</span>
                <span className="td-prop-v">
                  <SelectField
                    inline
                    value={detail.severity ?? ""}
                    placeholder="Set severity"
                    options={SEVERITY_OPTS}
                    onChange={(v) =>
                      patch({ severity: (v || null) as TaskSeverity | null })
                    }
                  />
                </span>
              </div>
            )}
            {detail.type !== "bug" && (
            <div className="td-prop">
              <span className="td-prop-k">Story Point</span>
              <span className="td-prop-v">
                {editingSP ? (
                  <input
                    className="sp-inline-input"
                    type="number"
                    min={0}
                    autoFocus
                    defaultValue={detail.story_points ?? ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      else if (e.key === "Escape") setEditingSP(false);
                    }}
                    onBlur={(e) => {
                      const v = e.target.value
                        ? Math.max(0, Math.round(Number(e.target.value)))
                        : null;
                      setEditingSP(false);
                      if (v !== detail.story_points) patch({ story_points: v });
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="sp-inline-trigger"
                    onClick={() => setEditingSP(true)}
                  >
                    <svg className="sp-ic" viewBox="0 0 14 14" fill="none" aria-hidden>
                      <path d="M12.7235 7.93333L10.5301 6.66667L12.7235 5.4C13.0435 5.21333 13.1501 4.80667 12.9701 4.48667L11.6368 2.18C11.4501 1.86 11.0435 1.75333 10.7235 1.93333L8.53015 3.2V0.666667C8.53015 0.3 8.23015 0 7.86348 0H5.19681C4.83015 0 4.53015 0.3 4.53015 0.666667V3.2L2.33681 1.93333C2.01681 1.75333 1.61015 1.86 1.42348 2.18L0.0901479 4.48667C-0.0965188 4.80667 0.0168146 5.21333 0.336815 5.4L2.53015 6.66667L0.336815 7.93333C0.0168146 8.12 -0.0898521 8.52667 0.0901479 8.84667L1.42348 11.1533C1.61015 11.4733 2.01681 11.58 2.33681 11.4L4.53015 10.1333V12.6667C4.53015 13.0333 4.83015 13.3333 5.19681 13.3333H7.86348C8.23015 13.3333 8.53015 13.0333 8.53015 12.6667V10.1333L10.7235 11.4C11.0435 11.5867 11.4501 11.4733 11.6368 11.1533L12.9701 8.84667C13.1568 8.52667 13.0435 8.12 12.7235 7.93333ZM10.8168 9.91333L7.69682 8.11333C7.47682 7.98 7.19682 8.14 7.19682 8.4V12H5.86348V8.4C5.86348 8.14667 5.58348 7.98 5.36348 8.11333L2.24348 9.91333L1.57681 8.76L4.69681 6.96C4.91681 6.83333 4.91681 6.51333 4.69681 6.38L1.57681 4.58L2.24348 3.42667L5.36348 5.22667C5.58348 5.35333 5.86348 5.19333 5.86348 4.93333V1.33333H7.19682V4.93333C7.19682 5.18667 7.47682 5.35333 7.69682 5.22L10.8168 3.42L11.4835 4.57333L8.36348 6.37333C8.14348 6.5 8.14348 6.82 8.36348 6.95333L11.4835 8.75333L10.8168 9.91333Z" fill="currentColor" />
                    </svg>
                    {detail.story_points != null && (
                      <span className="sp-val">{detail.story_points}</span>
                    )}
                  </button>
                )}
              </span>
            </div>
            )}
            <div className="td-prop">
              <span className="td-prop-k">Time Logged</span>
              <span className="td-prop-v td-prop-ro">
                <svg className="td-created-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="13" r="8" />
                  <path d="M12 9v4l2.5 1.5M9 2h6" />
                </svg>
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Sprint</span>
              <span className="td-prop-v">
                <SelectField
                  inline
                  value={String(detail.sprint_id ?? "")}
                  placeholder=""
                  placeholderIcon={<SprintIcon />}
                  options={sprints.map((s) => ({
                    value: String(s.id),
                    label: s.name,
                    icon: <SprintIcon />,
                  }))}
                  onChange={(v) =>
                    patch({ sprint_id: v ? Number(v) : null } as Partial<Task>)
                  }
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Label</span>
              <span className="td-prop-v">
                <LabelsField
                  value={detail.labels ?? []}
                  onChange={(labels) => patch({ labels })}
                />
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Created</span>
              <span className="td-prop-v td-prop-ro">
                <svg className="td-created-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {fmtDate(detail.created_at)}
              </span>
            </div>
            <div className="td-prop">
              <span className="td-prop-k">Created by</span>
              <span className="td-prop-v td-prop-ro">
                {detail.created_by_name ? (
                  <span className="td-creator">
                    <span className="td-creator-avatar">
                      {detail.created_by_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={detail.created_by_image} alt="" />
                      ) : (
                        initials(detail.created_by_name)
                      )}
                    </span>
                    {detail.created_by_name}
                  </span>
                ) : (
                  "—"
                )}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
