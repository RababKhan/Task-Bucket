"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/lib/attachment-limits";

export type Attachment = {
  id: number;
  name: string;
  type: string;
  size: number;
  created_at: string;
  uploader_name: string | null;
  uploader_image: string | null;
  uploaded_by_me: boolean;
  url: string | null;
};

// Same shape as fmtDateTime in app/(app)/task/[id]/page.tsx — kept local
// since it's a two-line formatter, not worth centralizing for one more use.
function fmtDateTime(iso: string | null | undefined): string {
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

const FileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

// The list only — uploading lives in TaskAttachmentModal, opened from the
// section header's "+" (app/(app)/task/[id]/page.tsx), not inline here.
export default function TaskAttachments({
  taskId,
  refreshSignal,
  onCountChange,
}: {
  taskId: string | number;
  // Bumped by the parent after a successful upload to trigger a re-fetch.
  refreshSignal?: number;
  // Lets the section header show a live count without the parent re-fetching.
  onCountChange?: (count: number) => void;
}) {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/attachments`);
    const list: Attachment[] = res.ok
      ? (await res.json().catch(() => ({ attachments: [] }))).attachments ?? []
      : [];
    setAttachments(list);
    onCountChange?.(list.length);
  }, [taskId, onCountChange]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, refreshSignal]);

  async function remove(a: Attachment) {
    const prev = attachments;
    setAttachments((cur) => {
      const next = cur?.filter((x) => x.id !== a.id) ?? cur;
      if (next) onCountChange?.(next.length);
      return next;
    });
    const res = await fetch(`/api/tasks/${taskId}/attachments/${a.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Could not remove that attachment.");
      setAttachments(prev ?? null);
      if (prev) onCountChange?.(prev.length);
    }
  }

  if (attachments === null) {
    return <div className="td-att-empty">Loading…</div>;
  }

  if (attachments.length === 0) {
    return (
      <div className="td-att-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        <span>No attachments yet.</span>
      </div>
    );
  }

  return (
    <div>
      <ul className="td-att-list">
        {attachments.map((a) => {
          const isImage = a.type.startsWith("image/");
          return (
            <li key={a.id} className="td-att-item">
              {isImage && a.url ? (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="td-att-thumb"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" />
                </a>
              ) : (
                <span className="td-att-icon" aria-hidden>
                  {FileIcon}
                </span>
              )}
              <div className="td-att-meta">
                {a.url ? (
                  <a
                    href={a.url}
                    download={a.name}
                    className="td-att-name"
                    title={a.name}
                  >
                    {a.name}
                  </a>
                ) : (
                  <span className="td-att-name" title={a.name}>
                    {a.name}
                  </span>
                )}
                <span className="td-att-sub">
                  {formatBytes(a.size)} · {a.uploader_name ?? "Someone"} ·{" "}
                  {fmtDateTime(a.created_at)}
                </span>
              </div>
              {a.uploaded_by_me && (
                <button
                  type="button"
                  className="td-att-remove"
                  aria-label={`Remove ${a.name}`}
                  data-tip="Remove"
                  onClick={() => remove(a)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="td-att-err">{error}</p>}
    </div>
  );
}
