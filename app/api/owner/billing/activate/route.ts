import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/session";
import { isSuperAdmin } from "@/lib/owner";
import {
  activateSubscription,
  getWorkspaceMeta,
  workspaceAdminEmails,
} from "@/lib/billing";
import { sendEmail, billingActivatedEmail } from "@/lib/email";
import type { BillingInterval } from "@/lib/plans";

// Owner activates Pro for a workspace after verifying the bank transfer.
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSuperAdmin(userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const workspaceId = String(body.workspace_id ?? "").trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required." }, { status: 400 });
  }
  const ws = await getWorkspaceMeta(workspaceId);
  if (!ws) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const interval: BillingInterval | null =
    body.interval === "year" ? "year" : body.interval === "month" ? "month" : null;
  const months =
    body.months != null && Number.isFinite(Number(body.months))
      ? Math.max(1, Math.floor(Number(body.months)))
      : null;
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const { expiry } = await activateSubscription(workspaceId, {
    interval,
    months,
    note,
    activatedBy: userId,
  });

  // Notify the workspace admins (best-effort — don't fail activation on email).
  try {
    const email = billingActivatedEmail(ws.name, expiry);
    const admins = await workspaceAdminEmails(workspaceId);
    await Promise.all(
      admins.map((a) =>
        sendEmail({ to: a.email, subject: email.subject, html: email.html, text: email.text })
      )
    );
  } catch (e) {
    console.warn("[owner/activate] admin notification failed:", e);
  }

  return NextResponse.json({ ok: true });
}
