# Team Member Management — Test Cases

Automated unit tests (`npm test`, Vitest) cover the pure logic: the permission
catalog (`tests/permissions.test.ts`) and the invitation helpers
(`tests/invites.test.ts`). The scenarios below are integration/manual checks —
run them against the app (they need auth + DB, so they aren't automated here).

## Permissions & visibility
1. **Admin** sees Employee Directory + all action buttons (Invite, Edit role, Project access, Deactivate, Remove) and the Roles & Permissions nav.
2. **Project Manager** (default) sees the directory and the **Invite** button; can resend/cancel invites and manage project access, but **Edit role / Deactivate / Remove are hidden**, and calling those APIs directly returns `403`.
3. **Member** (default) sees the directory **view-only** (no Invite, no row actions). `GET /api/team/members` works; `POST /api/team/invite` returns `403 "You do not have permission to invite members."`.
4. A **custom role** with `team_member:view` only → behaves like Member. Grant it `team_member:invite` in the matrix → the Invite button appears and the API allows it (no redeploy; live DB check).

## Invitation lifecycle
5. **Invite new email** with a role + 1–2 projects + a message → invite appears under Pending; email/token generated. Accept via link as a **new user** → account created, joined with the role, project access applied, invite status becomes **Accepted**.
6. **Invite existing-account email** → accept link prompts to **sign in**; after signing in as that email and clicking Accept, they join with the role + project access. Signed in as a *different* account → `403` with a clear message.
7. **Resend** a pending invite → new token + new 7-day expiry; old token no longer works.
8. **Cancel** a pending invite → status **Cancelled**; opening the link shows "This invitation has been cancelled." (`410`).
9. **Expiry** — an invite past `expires_at` is reported "This invitation has expired." and is flipped to **Expired** on next view/list.
10. **Duplicate guards** — inviting an email that's already an active member → `409 "This user already exists in this workspace."` Re-inviting a still-pending email supersedes the old pending invite.

## Roles, deactivation, removal (guards)
11. **Update role** of another member → applies immediately (their permissions change on next request). **Cannot change own role** → `400 "You cannot change your own role."`
12. **Last admin** — demote / deactivate / remove the only active admin → blocked with `"At least one Admin must remain in the workspace."`
13. **Deactivate** a member → they immediately lose access (any protected request returns `403 "This user is inactive."`); they remain listed as Inactive. **Activate** restores access.
14. **Remove** a member → deleted from the workspace; their `project_members` + task assignments cascade away.
15. Only an **admin** can grant the **admin** role (a custom role holding `update_role` cannot escalate someone to admin) → `403`.

## Project access scoping
16. **Admin** can grant access to any workspace project. **Manager** can only grant projects they manage; attempting to grant others → `403 "You do not have access to this project."`
17. Removing a member from a project revokes their access immediately (they can no longer open it or its tasks).

## Search / filter / pagination
18. Search by name/email narrows the list (debounced). Role/project/status filters combine. Pagination shows the right page count and navigates correctly.
