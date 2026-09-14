"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TASK,
  formatBytes,
} from "@/lib/attachment-limits";

type QueueStatus = "pending" | "uploading" | "done" | "error" | "canceled";
type QueueItem = {
  id: string;
  file: File;
  progress: number; // 0-100, from real upload byte counts (XHR progress) —
  // never a fake/simulated animation.
  status: QueueStatus;
  error?: string;
  previewUrl?: string; // object URL, images only
};

const FileIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

let nextId = 0;

// Small modal opened from the Attachments section's "+" (the header button
// next to "Bug" and "Sub Task" already work the same way). Shows real
// per-file upload progress (byte counts from the browser, not a fake
// animation) and a Cancel that genuinely aborts the request. No Pause and no
// time-remaining estimate: uploads here are a single plain POST per file,
// not a resumable/chunked protocol, so a Pause button would either do
// nothing or lie about what it does.
export default function TaskAttachmentModal({
  taskId,
  existingCount = 0,
  onClose,
  onUploaded,
}: {
  taskId: string | number;
  // How many attachments the task already has — lets the modal reject an
  // over-the-cap file itself instead of wasting a round trip to find out.
  existingCount?: number;
  onClose: () => void;
  // Called once per file as it finishes, not just once at the end, so the
  // section's list fills in live while the rest of the queue keeps going.
  onUploaded: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const processingRef = useRef(false);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  function setQ(updater: (q: QueueItem[]) => QueueItem[]) {
    queueRef.current = updater(queueRef.current);
    setQueue(queueRef.current);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Object URLs aren't freed by garbage collection on their own.
      for (const q of queueRef.current) {
        if (q.previewUrl) URL.revokeObjectURL(q.previewUrl);
      }
    };
  }, [onClose]);

  function processNext() {
    const next = queueRef.current.find((q) => q.status === "pending");
    if (!next) {
      processingRef.current = false;
      const settled = queueRef.current;
      if (settled.length > 0 && settled.every((q) => q.status === "done")) {
        onClose();
      }
      return;
    }
    processingRef.current = true;
    setQ((q) =>
      q.map((x) => (x.id === next.id ? { ...x, status: "uploading" } : x))
    );

    const form = new FormData();
    form.append("file", next.file);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      setQ((q) =>
        q.map((x) => (x.id === next.id ? { ...x, progress: pct } : x))
      );
    };
    xhr.onload = () => {
      xhrRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        setQ((q) =>
          q.map((x) =>
            x.id === next.id ? { ...x, status: "done", progress: 100 } : x
          )
        );
        onUploaded();
        processNext();
      } else {
        let message = `Could not upload "${next.file.name}".`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.error) message = data.error;
        } catch {}
        failRestOfQueue(next.id, message);
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      failRestOfQueue(next.id, `Could not upload "${next.file.name}". Check your connection.`);
    };
    xhr.open("POST", `/api/tasks/${taskId}/attachments`);
    xhr.send(form);
  }

  // One file failing stops the ones behind it too, same as the old
  // sequential-fetch version did — a hard error (over the cap, a rejected
  // type) rarely resolves itself mid-queue, so silently trying the rest
  // would just produce more of the same error.
  function failRestOfQueue(itemId: string, message: string) {
    processingRef.current = false;
    setQ((q) =>
      q
        .map((x): QueueItem =>
          x.id === itemId ? { ...x, status: "error", error: message } : x
        )
        .filter((x) => x.status !== "pending")
    );
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    const alreadyCounted = queueRef.current.filter(
      (q) => q.status !== "error" && q.status !== "canceled"
    ).length;
    let roomLeft = MAX_ATTACHMENTS_PER_TASK - existingCount - alreadyCounted;

    const items: QueueItem[] = incoming.map((file): QueueItem => {
      const id = String(nextId++);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        return { id, file, progress: 0, status: "error", error: "Files must be 20MB or smaller." };
      }
      if (roomLeft <= 0) {
        return {
          id,
          file,
          progress: 0,
          status: "error",
          error: `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} attachments.`,
        };
      }
      roomLeft -= 1;
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      return { id, file, progress: 0, status: "pending", previewUrl };
    });

    setQ((q) => [...q, ...items]);
    if (!processingRef.current) processNext();
  }

  function cancelActive() {
    xhrRef.current?.abort();
    xhrRef.current = null;
    processingRef.current = false;
    setQ((q) =>
      q
        .map((x) => (x.status === "uploading" ? { ...x, status: "canceled" as const } : x))
        .filter((x) => x.status !== "pending")
    );
  }

  const hasActive = queue.some((q) => q.status === "uploading");

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal task-modal attach-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="tm-head tm-head-x">
          <h2>Attachment</h2>
          <button
            type="button"
            className="sprint-x"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="tm-body">
          <div className="field">
            <label>
              Attachment
              <span
                className="att-info-ic"
                data-tip="Each file can be up to 20MB. A task can hold up to 20 attachments."
                data-tip-pos="top"
                aria-hidden
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 11v5" />
                  <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </span>
            </label>

            <div
              role="button"
              tabIndex={0}
              aria-label="Click to upload, or drag and drop a file here"
              className={`att-dropzone${dragOver ? " drag-over" : ""}`}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileRef.current?.click();
                }
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                dragDepth.current += 1;
                setDragOver(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => {
                dragDepth.current -= 1;
                if (dragDepth.current <= 0) setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragDepth.current = 0;
                setDragOver(false);
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
            >
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <svg className="att-dropzone-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
              <p className="att-dropzone-text">
                <span className="att-dropzone-cta">Click to upload</span> or
                Drag and drop
              </p>
              <span className="att-dropzone-sub">Max file size 20MB</span>
            </div>
          </div>

          {queue.length > 0 && (
            <ul className="att-queue">
              {queue.map((q) => (
                <li key={q.id} className={`att-q-item att-q-${q.status}`}>
                  <span className="att-q-thumb" aria-hidden>
                    {q.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={q.previewUrl} alt="" />
                    ) : (
                      FileIcon
                    )}
                  </span>
                  <div className="att-q-info">
                    <div className="att-q-toprow">
                      <span className="att-q-name" title={q.file.name}>
                        {q.file.name}
                      </span>
                      <span className="att-q-size">{formatBytes(q.file.size)}</span>
                    </div>
                    {q.status === "uploading" && (
                      <>
                        <div className="att-q-bar">
                          <div
                            className="att-q-bar-fill"
                            style={{ width: `${q.progress}%` }}
                          />
                        </div>
                        <div className="att-q-meta">
                          <span>Uploading… {q.progress}%</span>
                          <button
                            type="button"
                            className="att-q-cancel"
                            onClick={cancelActive}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                    {q.status === "done" && (
                      <span className="att-q-status att-q-status-ok">Uploaded</span>
                    )}
                    {q.status === "error" && (
                      <span className="att-q-status att-q-status-err">{q.error}</span>
                    )}
                    {q.status === "canceled" && (
                      <span className="att-q-status">Canceled</span>
                    )}
                    {q.status === "pending" && (
                      <span className="att-q-status">Waiting…</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!hasActive && queue.some((q) => q.status === "error") && (
            <p className="invite-err">
              {queue.some((q) => q.status === "done")
                ? "Some files couldn't be uploaded — see above. The rest went through."
                : "That didn't go through — see above."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
