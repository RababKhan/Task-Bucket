import {
  pgTable,
  serial,
  text,
  integer,
  primaryKey,
  unique,
  index,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Timestamps are kept as TEXT in the SQLite-compatible 'YYYY-MM-DD HH:MM:SS'
// (UTC) shape the app already reads/writes, so route SQL and formatters are
// unchanged. This native default needs no custom function.
const nowText = sql`to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS')`;

// Booleans are stored as integer 0/1 (matching the old SQLite columns) so the
// app's `active = 1` checks and `!!row.active` reads don't change.

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").unique(),
  image: text("image"),
  passwordHash: text("password_hash"),
  emailVerified: text("email_verified"),
  createdAt: text("created_at").notNull().default(nowText),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
  },
  (t) => [unique().on(t.provider, t.providerAccountId)]
);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
});

export const passwordOtps = pgTable("password_otps", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  otpHash: text("otp_hash"),
  expiresAt: text("expires_at"),
  attempts: integer("attempts").notNull().default(0),
  resetTokenHash: text("reset_token_hash"),
  resetExpiresAt: text("reset_expires_at"),
  createdAt: text("created_at").notNull().default(nowText),
});

export const signupOtps = pgTable("signup_otps", {
  email: text("email").primaryKey(),
  otpHash: text("otp_hash"),
  expiresAt: text("expires_at"),
  attempts: integer("attempts").notNull().default(0),
  verifyTokenHash: text("verify_token_hash"),
  verifyExpiresAt: text("verify_expires_at"),
  createdAt: text("created_at").notNull().default(nowText),
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  createdAt: text("created_at").notNull().default(nowText),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("assignee"),
    active: integer("active").notNull().default(1),
    lastActiveAt: text("last_active_at"),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("idx_members_user").on(t.userId),
  ]
);

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("assignee"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by"),
    status: text("status").notNull().default("pending"),
    projectAccess: text("project_access").notNull().default("[]"),
    message: text("message"),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    cancelledAt: text("cancelled_at"),
    updatedAt: text("updated_at"),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    index("idx_invites_ws_status").on(t.workspaceId, t.status),
    check(
      "workspace_invites_status_check",
      sql`${t.status} IN ('pending','accepted','expired','cancelled')`
    ),
  ]
);

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    managerId: text("manager_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    taskSeq: integer("task_seq").notNull().default(0),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    index("idx_projects_owner").on(t.ownerId),
    index("idx_projects_workspace").on(t.workspaceId),
  ]
);

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: integer("is_system").notNull().default(0),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    unique().on(t.workspaceId, t.key),
    index("idx_roles_workspace").on(t.workspaceId),
  ]
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    addedBy: text("added_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] })]
);

export const sprints = pgTable(
  "sprints",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    goal: text("goal").notNull().default(""),
    status: text("status").notNull().default("planned"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    check(
      "sprints_status_check",
      sql`${t.status} IN ('planned','active','completed')`
    ),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "cascade",
    }),
    sprintId: integer("sprint_id").references(() => sprints.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    type: text("type").notNull().default("task"),
    status: text("status").notNull().default("backlog"),
    priority: text("priority").notNull().default("medium"),
    severity: text("severity"),
    storyPoints: integer("story_points"),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    labels: text("labels").notNull().default("[]"),
    position: integer("position").notNull().default(0),
    seq: integer("seq"),
    progress: integer("progress"),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    storyId: integer("story_id").references((): AnyPgColumn => tasks.id, {
      onDelete: "set null",
    }),
    linkedTo: integer("linked_to").references((): AnyPgColumn => tasks.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    index("idx_tasks_project").on(t.projectId),
    index("idx_tasks_parent").on(t.parentId),
    index("idx_tasks_sprint").on(t.sprintId),
    check(
      "tasks_type_check",
      sql`${t.type} IN ('story','task','bug')`
    ),
    check(
      "tasks_status_check",
      sql`${t.status} IN ('backlog','dev_in_progress','dev_done','in_test','test_in_progress','test_fail','test_done','ready_for_deploy','done')`
    ),
    check(
      "tasks_priority_check",
      sql`${t.priority} IN ('critical','high','medium','low')`
    ),
  ]
);

export const taskAssignees = pgTable(
  "task_assignees",
  {
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.userId] }),
    index("idx_task_assignees_task").on(t.taskId),
  ]
);

export const customFields = pgTable(
  "custom_fields",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default("text"),
    options: text("options").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [
    check(
      "custom_fields_type_check",
      sql`${t.type} IN ('text','number','date','select')`
    ),
  ]
);

export const customFieldValues = pgTable(
  "custom_field_values",
  {
    fieldId: integer("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    value: text("value").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.fieldId, t.taskId] })]
);

export const taskActivity = pgTable(
  "task_activity",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull(),
    meta: text("meta"),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [index("idx_task_activity_task").on(t.taskId)]
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: serial("id").primaryKey(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references(
      (): AnyPgColumn => taskComments.id,
      { onDelete: "cascade" }
    ),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: text("created_at").notNull().default(nowText),
    updatedAt: text("updated_at"),
  },
  (t) => [
    index("idx_task_comments_task").on(t.taskId),
    index("idx_task_comments_parent").on(t.parentId),
  ]
);

export const commentReactions = pgTable(
  "comment_reactions",
  {
    commentId: integer("comment_id")
      .notNull()
      .references(() => taskComments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })]
);

export const commentAttachments = pgTable(
  "comment_attachments",
  {
    id: serial("id").primaryKey(),
    commentId: integer("comment_id")
      .notNull()
      .references(() => taskComments.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull().default(""),
    data: text("data").notNull(),
    createdAt: text("created_at").notNull().default(nowText),
  },
  (t) => [index("idx_comment_attachments_comment").on(t.commentId)]
);

// One row per workspace (1:1). Absence of a row is treated as the free plan.
export const subscriptions = pgTable("subscriptions", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"), // 'free' | 'pro'
  status: text("status").notNull().default("active"), // stripe subscription status
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  priceId: text("price_id"),
  interval: text("interval"), // 'month' | 'year'
  currentPeriodEnd: text("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  createdAt: text("created_at").notNull().default(nowText),
  updatedAt: text("updated_at"),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    module: text("module").notNull(),
    action: text("action").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.module, t.action] }),
    index("idx_role_permissions_ws").on(t.workspaceId),
  ]
);
