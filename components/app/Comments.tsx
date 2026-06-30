"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import type { Member } from "@/lib/types";
import type { CommentNode } from "@/lib/comments";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import emojiData from "@emoji-mart/data";
import twemoji from "@twemoji/api";

// Full emoji picker (category tabs, search, frequently used) — client-only.
const EmojiPicker = dynamic(() => import("@emoji-mart/react"), { ssr: false });

// Render text/emoji with Twemoji images so emojis match Slack's look.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function twHtml(s: string) {
  return twemoji.parse(escapeHtml(s), {
    folder: "svg",
    ext: ".svg",
    className: "cm-tw-emoji",
  });
}
function tw(s: string, key?: string | number): ReactNode {
  return <span key={key} dangerouslySetInnerHTML={{ __html: twHtml(s) }} />;
}

const EMOJIS = ["👍", "❤️", "😄", "🎉", "🙌", "👀", "✅", "🔥"];
// Quick one-click reactions shown in the hover toolbar.
const QUICK = ["✅", "🆗", "🙌"];

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toDate(iso: string) {
  return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
}
function shortTime(iso: string) {
  return toDate(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
function fmtTime(iso: string) {
  const d = toDate(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return shortTime(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Inline markdown: `code`, **bold**, ~~strike~~, <u>underline</u>, *italic*,
// _italic_, [text](url), and @Member mentions.
function renderInline(
  text: string,
  members: Member[],
  key = ""
): ReactNode[] {
  const names = members
    .map((m) => m.name || m.email || "")
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  const mentionAlt = names.length ? "|(@(?:" + names.join("|") + "))" : "";
  const re = new RegExp(
    "`([^`]+)`" +
      "|\\*\\*([^*]+?)\\*\\*" +
      "|~~([^~]+?)~~" +
      "|<u>([\\s\\S]*?)</u>" +
      "|\\*([^*]+?)\\*" +
      "|_([^_]+?)_" +
      "|\\[([^\\]]+?)\\]\\(([^)\\s]+)\\)" +
      mentionAlt,
    "g"
  );
  const out: ReactNode[] = [];
  let last = 0;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last)
      out.push(tw(text.slice(last, m.index), `${key}-t${idx}`));
    const k = `${key}-${idx++}`;
    if (m[1] != null) out.push(<code className="cm-ic" key={k}>{m[1]}</code>);
    else if (m[2] != null) out.push(<strong key={k}>{tw(m[2])}</strong>);
    else if (m[3] != null) out.push(<s key={k}>{tw(m[3])}</s>);
    else if (m[4] != null) out.push(<u key={k}>{tw(m[4])}</u>);
    else if (m[5] != null) out.push(<em key={k}>{tw(m[5])}</em>);
    else if (m[6] != null) out.push(<em key={k}>{tw(m[6])}</em>);
    else if (m[7] != null)
      out.push(
        <a className="cm-link" href={m[8]} target="_blank" rel="noreferrer" key={k}>
          {tw(m[7])}
        </a>
      );
    else if (m[9] != null)
      out.push(
        <span className="cm-mention" key={k}>
          {m[9]}
        </span>
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(tw(text.slice(last), `${key}-tend`));
  return out;
}

// Block markdown: fenced ``` code blocks ```, bullet/numbered lists, and
// paragraphs (with inline marks).
function renderBody(text: string, members: Member[]): ReactNode {
  const out: ReactNode[] = [];
  // Drop trailing blank lines so they don't render as empty space.
  const segs = text.replace(/\s+$/, "").split(/```([\s\S]*?)```/g);
  segs.forEach((seg, si) => {
    if (si % 2 === 1) {
      out.push(
        <pre className="cm-code" key={`c${si}`}>
          <code>{seg.replace(/^\n/, "").replace(/\n$/, "")}</code>
        </pre>
      );
      return;
    }
    if (!seg) return;
    const lines = seg.split("\n");
    let j = 0;
    while (j < lines.length) {
      if (/^\s*[-*]\s+/.test(lines[j])) {
        const items: string[] = [];
        while (j < lines.length && /^\s*[-*]\s+/.test(lines[j]))
          items.push(lines[j++].replace(/^\s*[-*]\s+/, ""));
        out.push(
          <ul className="cm-ul" key={`u${si}-${j}`}>
            {items.map((it, k) => (
              <li key={k}>{renderInline(it, members, `u${si}${j}${k}`)}</li>
            ))}
          </ul>
        );
        continue;
      }
      if (/^\s*\d+\.\s+/.test(lines[j])) {
        const items: string[] = [];
        while (j < lines.length && /^\s*\d+\.\s+/.test(lines[j]))
          items.push(lines[j++].replace(/^\s*\d+\.\s+/, ""));
        out.push(
          <ol className="cm-ol" key={`o${si}-${j}`}>
            {items.map((it, k) => (
              <li key={k}>{renderInline(it, members, `o${si}${j}${k}`)}</li>
            ))}
          </ol>
        );
        continue;
      }
      const para: string[] = [];
      while (
        j < lines.length &&
        !/^\s*[-*]\s+/.test(lines[j]) &&
        !/^\s*\d+\.\s+/.test(lines[j])
      )
        para.push(lines[j++]);
      // Trim blank lines around the paragraph and skip it if it's all empty.
      while (para.length && para[para.length - 1].trim() === "") para.pop();
      while (para.length && para[0].trim() === "") para.shift();
      if (!para.length) continue;
      const nodes: ReactNode[] = [];
      para.forEach((p, k) => {
        if (k > 0) nodes.push(<br key={`br${si}${j}${k}`} />);
        nodes.push(...renderInline(p, members, `p${si}${j}${k}`));
      });
      out.push(
        <span className="cm-para" key={`p${si}-${j}`}>
          {nodes}
        </span>
      );
    }
  });
  return out;
}

// Each message is shown separately with its own avatar, name, and timestamp.
function withGroups(list: CommentNode[]) {
  return list.map((c) => ({ c, grouped: false }));
}

/* ---------- Textarea with @mention autocomplete ---------- */

type MentionHandle = {
  focus: () => void;
  wrap: (before: string, after: string) => void;
  linePrefix: (prefix: string, numbered?: boolean) => void;
  insert: (str: string) => void;
};

const MentionInput = forwardRef<
  MentionHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onEnter?: () => void;
    onEscape?: () => void;
    members: Member[];
    placeholder?: string;
    className?: string;
    autoFocus?: boolean;
  }
>(function MentionInput(
  { value, onChange, onEnter, onEscape, members, placeholder, className, autoFocus },
  fwdRef
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ q: string; at: number } | null>(null);
  const [hi, setHi] = useState(0);

  const matches = menu
    ? members
        .filter((m) =>
          (m.name || m.email || "").toLowerCase().includes(menu.q)
        )
        .slice(0, 6)
    : [];

  function detect(text: string, pos: number) {
    const before = text.slice(0, pos);
    const m = before.match(/(^|\s)@(\w*)$/);
    if (m && members.length) {
      setMenu({ q: m[2].toLowerCase(), at: pos - m[2].length - 1 });
      setHi(0);
    } else {
      setMenu(null);
    }
  }

  function pick(member: Member) {
    const el = ref.current;
    if (!el || !menu) return;
    const pos = el.selectionStart ?? value.length;
    const name = member.name || member.email || "";
    const insert = "@" + name + " ";
    const next = value.slice(0, menu.at) + insert + value.slice(pos);
    onChange(next);
    setMenu(null);
    const caret = menu.at + insert.length;
    requestAnimationFrame(() => {
      el.focus();
      try {
        el.setSelectionRange(caret, caret);
      } catch {}
    });
  }

  // Formatting helpers exposed to the toolbar.
  useImperativeHandle(
    fwdRef,
    () => ({
      focus: () => ref.current?.focus(),
      insert(str: string) {
        const el = ref.current;
        if (!el) return;
        const s = el.selectionStart ?? value.length;
        const e = el.selectionEnd ?? s;
        const next = value.slice(0, s) + str + value.slice(e);
        onChange(next);
        const caret = s + str.length;
        requestAnimationFrame(() => {
          el.focus();
          try {
            el.setSelectionRange(caret, caret);
          } catch {}
        });
      },
      wrap(before: string, after: string) {
        const el = ref.current;
        if (!el) return;
        const s = el.selectionStart ?? value.length;
        const e = el.selectionEnd ?? s;
        const sel = value.slice(s, e) || "text";
        const next = value.slice(0, s) + before + sel + after + value.slice(e);
        onChange(next);
        const cs = s + before.length;
        const ce = cs + sel.length;
        requestAnimationFrame(() => {
          el.focus();
          try {
            el.setSelectionRange(cs, ce);
          } catch {}
        });
      },
      linePrefix(prefix: string, numbered?: boolean) {
        const el = ref.current;
        if (!el) return;
        const s = el.selectionStart ?? 0;
        const e = el.selectionEnd ?? s;
        const start = value.lastIndexOf("\n", Math.max(0, s - 1)) + 1;
        let end = value.indexOf("\n", e);
        if (end === -1) end = value.length;
        const lines = value.slice(start, end).split("\n");
        let n = 1;
        const prefixed = lines
          .map((l) => (numbered ? `${n++}. ` : prefix) + l)
          .join("\n");
        const next = value.slice(0, start) + prefixed + value.slice(end);
        onChange(next);
        requestAnimationFrame(() => el.focus());
      },
    }),
    [value, onChange]
  );

  return (
    <div className="cm-mention-wrap">
      <textarea
        ref={ref}
        className={className}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) =>
          detect(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
        }
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            detect(e.currentTarget.value, e.currentTarget.selectionStart ?? 0);
        }}
        onKeyDown={(e) => {
          if (menu && matches.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHi((h) => (h + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHi((h) => (h - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[hi]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMenu(null);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onEnter?.();
          } else if (e.key === "Escape") {
            onEscape?.();
          }
        }}
        onBlur={() => window.setTimeout(() => setMenu(null), 120)}
      />
      {menu && matches.length > 0 && (
        <ul className="cm-mention-menu">
          {matches.map((m, i) => (
            <li key={m.user_id}>
              <button
                type="button"
                className={`cm-mention-opt${i === hi ? " active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseEnter={() => setHi(i)}
              >
                <span className="cm-mention-av">
                  {initials(m.name || m.email)}
                </span>
                <span className="cm-mention-nm">{m.name || m.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/* ---------------- Comments ---------------- */

export default function Comments({
  taskId,
  members = [],
  sortNewest = false,
}: {
  taskId: string;
  members?: Member[];
  sortNewest?: boolean;
}) {
  const { data: session } = useSession();
  const me = session?.user;

  const [comments, setComments] = useState<CommentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [composerEmoji, setComposerEmoji] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<
    { name: string; type: string; data: string }[]
  >([]);

  const [emojiPos, setEmojiPos] = useState<{
    left: number;
    bottom: number;
  } | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<MentionHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const emojiPortalRef = useRef<HTMLDivElement>(null);

  // emoji-mart renders in an (open) shadow DOM. Inject a style to match our
  // sizing/theme, and KEEP it applied: emoji-mart re-renders its shadow tree
  // when you pick an emoji (updating "Frequently used"), which wipes the style —
  // so a MutationObserver re-injects it whenever it goes missing.
  useEffect(() => {
    if (!composerEmoji) return;
    // Inner-shadow element styles (re-injected if emoji-mart wipes them).
    const css =
      ".search input{" +
      "height:28px;" +
      "padding:0 28px 0 32px;" +
      "border-radius:8px !important;" +
      "font-size:11.375px;" +
      "background:transparent !important;" +
      "border:1px solid #e7e5e4 !important;" +
      "}" +
      ".search input:focus{outline:none;border-color:rgb(var(--rgb-accent)) !important}" +
      ".sticky{font-size:11.375px !important}" +
      ".scroll{scrollbar-width:thin}" +
      ".scroll::-webkit-scrollbar{width:6px}" +
      ".scroll::-webkit-scrollbar-thumb{background:rgba(var(--rgb-color),0.22);border-radius:3px}" +
      ".scroll::-webkit-scrollbar-track{background:transparent}";

    // Host-level values go on the host's INLINE style — inline wins over the
    // :host defaults and survives emoji-mart's shadow re-renders (which were
    // resetting the design after an emoji was picked).
    const apply = (host: HTMLElement, sr: ShadowRoot) => {
      host.style.height = "360px";
      host.style.setProperty(
        "--font-family",
        "var(--font-inter),'Inter',ui-sans-serif,system-ui,sans-serif"
      );
      host.style.setProperty("--preview-title-size", "11.375px");
      host.style.setProperty("--preview-subtitle-size", "11.375px");
      host.style.setProperty("--preview-placeholder-size", "11.375px");
      if (!sr.querySelector("style[data-tb]")) {
        const s = document.createElement("style");
        s.setAttribute("data-tb", "1");
        s.textContent = css;
        sr.appendChild(s);
      }
    };

    const findHost = () =>
      emojiPortalRef.current
        ? (Array.from(
            emojiPortalRef.current.querySelectorAll<HTMLElement>("*")
          ).find((el) => el.shadowRoot) as HTMLElement | undefined)
        : undefined;

    let obs: MutationObserver | null = null;
    let raf = 0;
    let frames = 0;
    // Re-apply on every frame for ~1.5s (covers the picker's async (re)mount,
    // whose timing differs between first open and reopen), then let the
    // MutationObserver keep it applied for the rest of the session.
    const tick = () => {
      const host = findHost();
      const sr = host?.shadowRoot;
      if (host && sr) {
        apply(host, sr);
        if (!obs) {
          obs = new MutationObserver(() => {
            const h = findHost();
            if (h?.shadowRoot) apply(h, h.shadowRoot);
          });
          obs.observe(sr, { childList: true, subtree: true });
        }
      }
      if (frames++ < 90) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      obs?.disconnect();
    };
  }, [composerEmoji]);

  // Open the emoji picker as a fixed popover above the button (escapes the
  // panel's overflow clip).
  function toggleComposerEmoji() {
    if (!composerEmoji && emojiBtnRef.current) {
      const r = emojiBtnRef.current.getBoundingClientRect();
      const W = 270;
      let left = r.left;
      if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
      // Anchor the picker's bottom just above the button so it grows upward and
      // never overlaps the composer regardless of its height.
      setEmojiPos({
        left: Math.max(8, left),
        bottom: window.innerHeight - r.top + 8,
      });
    }
    setComposerEmoji((v) => !v);
  }

  function readFiles(fileList: FileList | null) {
    if (!fileList) return;
    const room = 8 - pendingFiles.length;
    const arr = Array.from(fileList).slice(0, Math.max(0, room));
    Promise.all(
      arr.map(
        (f) =>
          new Promise<{ name: string; type: string; data: string } | null>(
            (resolve) => {
              if (f.size > 4 * 1024 * 1024) {
                resolve(null); // skip files larger than 4MB
                return;
              }
              const r = new FileReader();
              r.onload = () =>
                resolve({ name: f.name, type: f.type, data: String(r.result) });
              r.onerror = () => resolve(null);
              r.readAsDataURL(f);
            }
          )
      )
    ).then((res) => {
      const ok = res.filter(Boolean) as {
        name: string;
        type: string;
        data: string;
      }[];
      if (ok.length) setPendingFiles((p) => [...p, ...ok]);
    });
  }

  const setIfChanged = useCallback((next: CommentNode[]) => {
    setComments((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next
    );
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) {
      const d = await res.json();
      setIfChanged(Array.isArray(d.comments) ? d.comments : []);
    }
    setLoading(false);
  }, [taskId, setIfChanged]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll for live updates while the tab is visible.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.hidden || stopped) return;
      const res = await fetch(`/api/tasks/${taskId}/comments`);
      if (!res.ok || stopped) return;
      const d = await res.json();
      setIfChanged(Array.isArray(d.comments) ? d.comments : []);
    };
    const iv = window.setInterval(tick, 3500);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [taskId, setIfChanged]);

  // Close any open emoji picker on an outside click.
  useEffect(() => {
    if (pickerFor == null && !composerEmoji) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest(".cm-react-wrap") && !t.closest(".cm-emoji-portal")) {
        setPickerFor(null);
      }
      if (
        !t.closest(".cm-emoji-portal") &&
        t !== emojiBtnRef.current &&
        !emojiBtnRef.current?.contains(t)
      ) {
        setComposerEmoji(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerFor, composerEmoji]);

  function scrollToNew() {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = sortNewest ? 0 : el.scrollHeight;
    });
  }
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = sortNewest ? 0 : el.scrollHeight;
  }, [sortNewest]);

  async function apply(res: Response) {
    if (res.ok) {
      const d = await res.json();
      setIfChanged(Array.isArray(d.comments) ? d.comments : []);
    }
  }

  async function post(
    body: string,
    parentId?: number,
    attachments?: { name: string; type: string; data: string }[]
  ) {
    const t = body.trim();
    const atts = attachments ?? [];
    if ((!t && atts.length === 0) || busy) return;
    setBusy(true);
    const res = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: t,
        parent_id: parentId ?? null,
        attachments: atts,
      }),
    });
    await apply(res);
    setBusy(false);
    if (parentId == null) {
      setText("");
      setPendingFiles([]);
      scrollToNew();
    } else {
      setReplyText("");
      setReplyTo(null);
    }
  }

  async function saveEdit(id: number) {
    const t = editText.trim();
    if (!t) return;
    await apply(
      await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: t }),
      })
    );
    setEditingId(null);
    setEditText("");
  }

  async function removeComment(id: number) {
    if (!window.confirm("Delete this comment?")) return;
    await apply(await fetch(`/api/comments/${id}`, { method: "DELETE" }));
  }

  async function toggleReact(id: number, emoji: string) {
    setPickerFor(null);
    await apply(
      await fetch(`/api/comments/${id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      })
    );
  }

  function Avatar({
    name,
    image,
  }: {
    name?: string | null;
    image?: string | null;
  }) {
    return (
      <span className="cm-avatar">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" />
        ) : (
          initials(name)
        )}
      </span>
    );
  }

  function renderComment(c: CommentNode, isReply: boolean, grouped: boolean) {
    const editing = editingId === c.id;
    return (
      <div
        key={c.id}
        className={`cm-item${isReply ? " cm-reply" : ""}${
          grouped ? " cm-grouped" : ""
        }`}
      >
        <div className="cm-gutter">
          {!grouped && <Avatar name={c.user_name} image={c.user_image} />}
        </div>

        <div className="cm-main">
          {!grouped && (
            <div className="cm-head">
              <span className="cm-name">{c.user_name ?? "Someone"}</span>
              <span className="cm-time">
                {fmtTime(c.created_at)}
                {c.updated_at ? " · edited" : ""}
              </span>
            </div>
          )}

          {editing ? (
            <div className="cm-edit">
              <MentionInput
                className="cm-edit-input"
                value={editText}
                onChange={setEditText}
                members={members}
                autoFocus
                onEnter={() => saveEdit(c.id)}
                onEscape={() => setEditingId(null)}
              />
              <div className="cm-edit-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setEditingId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => saveEdit(c.id)}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            c.body && <div className="cm-body">{renderBody(c.body, members)}</div>
          )}

          {c.attachments.length > 0 && (
            <div className="cm-attachments">
              {c.attachments.map((a) =>
                a.type.startsWith("image/") ? (
                  <a
                    key={a.id}
                    href={a.data}
                    target="_blank"
                    rel="noreferrer"
                    className="cm-att-img"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.data} alt={a.name} />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={a.data}
                    download={a.name}
                    className="cm-att-file"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <span className="cm-att-fname">{a.name}</span>
                  </a>
                )
              )}
            </div>
          )}

          {c.reactions.length > 0 && (
            <div className="cm-reactions">
              {c.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={`cm-chip${r.mine ? " mine" : ""}`}
                  onClick={() => toggleReact(c.id, r.emoji)}
                >
                  {tw(r.emoji)}
                  <span className="cm-chip-n">{r.count}</span>
                </button>
              ))}
            </div>
          )}

          {!isReply && c.replies.length > 0 && (
            <div className="cm-thread">
              {withGroups(c.replies).map(({ c: r, grouped: g }) =>
                renderComment(r, true, g)
              )}
            </div>
          )}
          {!isReply && replyTo === c.id && (
            <div className="cm-reply-box">
              <MentionInput
                className="cm-input"
                value={replyText}
                onChange={setReplyText}
                members={members}
                autoFocus
                placeholder="Reply…"
                onEnter={() => post(replyText, c.id)}
                onEscape={() => setReplyTo(null)}
              />
              <button
                type="button"
                className="cm-send"
                disabled={busy || !replyText.trim()}
                onClick={() => post(replyText, c.id)}
                aria-label="Send reply"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Floating hover toolbar (Slack-style). */}
        <div className="cm-float">
          {QUICK.map((e) => (
            <button
              key={e}
              type="button"
              className="cm-quick"
              aria-label={`React ${e}`}
              onClick={() => toggleReact(c.id, e)}
            >
              {tw(e)}
            </button>
          ))}
          <div className="cm-react-wrap">
            <button
              type="button"
              className="cm-action"
              aria-label="Add reaction"
              data-tip="React"
              onClick={() => setPickerFor((p) => (p === c.id ? null : c.id))}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 14.5a4 4 0 0 0 7 0" />
                <path d="M9 9h.01M15 9h.01" />
              </svg>
            </button>
            {pickerFor === c.id && (
              <div className="cm-emoji-pop">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="cm-emoji-opt"
                    onClick={() => toggleReact(c.id, e)}
                  >
                    {tw(e)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!isReply && (
            <button
              type="button"
              className="cm-action"
              aria-label="Reply"
              data-tip="Reply in thread"
              onClick={() => {
                setReplyTo((r) => (r === c.id ? null : c.id));
                setReplyText("");
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 17H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-5l-4 3v-3z" />
              </svg>
            </button>
          )}
          {c.mine && (
            <>
              <button
                type="button"
                className="cm-action"
                aria-label="Edit"
                data-tip="Edit"
                onClick={() => {
                  setEditingId(c.id);
                  setEditText(c.body);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
              <button
                type="button"
                className="cm-action cm-action-danger"
                aria-label="Delete"
                data-tip="Delete"
                onClick={() => removeComment(c.id)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const ordered = sortNewest ? [...comments].reverse() : comments;

  return (
    <div className="cm-root">
      <div className="cm-list" ref={listRef}>
        {loading ? (
          <div className="cm-empty">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="cm-empty">No messages yet. Start the conversation.</div>
        ) : (
          withGroups(ordered).map(({ c, grouped }) =>
            renderComment(c, false, grouped)
          )
        )}
      </div>

      {/* Slack-style composer */}
      <div className="cm-composer">
        <div className="cm-box">
          {showFormat && (
            <div className="cm-format">
              <button type="button" className="cm-fbtn" aria-label="Bold" data-tip="Bold" onClick={() => composerRef.current?.wrap("**", "**")}>
                <span style={{ fontWeight: 700 }}>B</span>
              </button>
              <button type="button" className="cm-fbtn" aria-label="Italic" data-tip="Italic" onClick={() => composerRef.current?.wrap("*", "*")}>
                <span style={{ fontStyle: "italic" }}>I</span>
              </button>
              <button type="button" className="cm-fbtn" aria-label="Underline" data-tip="Underline" onClick={() => composerRef.current?.wrap("<u>", "</u>")}>
                <span style={{ textDecoration: "underline" }}>U</span>
              </button>
              <button type="button" className="cm-fbtn" aria-label="Strikethrough" data-tip="Strikethrough" onClick={() => composerRef.current?.wrap("~~", "~~")}>
                <span style={{ textDecoration: "line-through" }}>S</span>
              </button>
              <span className="cm-fsep" />
              <button
                type="button"
                className="cm-fbtn"
                aria-label="Link"
                data-tip="Link"
                onClick={() => {
                  const url = window.prompt("Link URL", "https://");
                  if (url) composerRef.current?.wrap("[", `](${url})`);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                </svg>
              </button>
              <span className="cm-fsep" />
              <button type="button" className="cm-fbtn" aria-label="Numbered list" data-tip="Numbered list" onClick={() => composerRef.current?.linePrefix("", true)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 16H4l2 2-2 2h2" />
                </svg>
              </button>
              <button type="button" className="cm-fbtn" aria-label="Bullet list" data-tip="Bullet list" onClick={() => composerRef.current?.linePrefix("- ")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </button>
              <span className="cm-fsep" />
              <button type="button" className="cm-fbtn" aria-label="Inline code" data-tip="Inline code" onClick={() => composerRef.current?.wrap("`", "`")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m8 16-4-4 4-4M16 8l4 4-4 4" />
                </svg>
              </button>
              <button type="button" className="cm-fbtn" aria-label="Code block" data-tip="Code block" onClick={() => composerRef.current?.wrap("```\n", "\n```")}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" />
                </svg>
              </button>
            </div>
          )}
          <MentionInput
            ref={composerRef}
            className="cm-box-input"
            value={text}
            onChange={setText}
            members={members}
            placeholder="Write a message…  (@ to mention)"
            onEnter={() => post(text, undefined, pendingFiles)}
          />

          {pendingFiles.length > 0 && (
            <div className="cm-attach-row">
              {pendingFiles.map((f, i) => (
                <div className="cm-attach-pending" key={i}>
                  {f.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.data} alt="" />
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  )}
                  <span className="cm-attach-name">{f.name}</span>
                  <button
                    type="button"
                    className="cm-attach-x"
                    aria-label="Remove"
                    onClick={() =>
                      setPendingFiles((p) => p.filter((_, k) => k !== i))
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="cm-box-bar">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                readFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="cm-tool"
              aria-label="Attach files"
              data-tip="Attach files"
              onClick={() => fileRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              className={`cm-tool${showFormat ? " active" : ""}`}
              aria-label={showFormat ? "Hide formatting" : "Show formatting"}
              data-tip={showFormat ? "Hide formatting" : "Show formatting"}
              onClick={() => setShowFormat((v) => !v)}
            >
              <span className="cm-aa">Aa</span>
            </button>
            <button
              ref={emojiBtnRef}
              type="button"
              className="cm-tool"
              aria-label="Emoji"
              data-tip="Emoji"
              onClick={toggleComposerEmoji}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M8.5 14.5a4 4 0 0 0 7 0" />
                <path d="M9 9h.01M15 9h.01" />
              </svg>
            </button>
            {composerEmoji &&
              emojiPos &&
              createPortal(
                <div
                  ref={emojiPortalRef}
                  className="cm-emoji-portal"
                  style={{
                    position: "fixed",
                    left: emojiPos.left,
                    bottom: emojiPos.bottom,
                    zIndex: 1000,
                  }}
                >
                  <EmojiPicker
                    data={emojiData}
                    theme={
                      typeof document !== "undefined" &&
                      document.documentElement.getAttribute("data-theme") ===
                        "light"
                        ? "light"
                        : "dark"
                    }
                    previewPosition="bottom"
                    skinTonePosition="none"
                    navPosition="top"
                    perLine={8}
                    emojiButtonSize={28}
                    emojiSize={18}
                    maxFrequentRows={2}
                    onEmojiSelect={(e: { native: string }) => {
                      composerRef.current?.insert(e.native);
                      setComposerEmoji(false);
                    }}
                  />
                </div>,
                document.body
              )}
            <button
              type="button"
              className="cm-tool"
              aria-label="Mention someone"
              data-tip="Mention someone"
              onClick={() =>
                setText((t) => (t && !t.endsWith(" ") ? t + " @" : t + "@"))
              }
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
              </svg>
            </button>
            <button
              type="button"
              className="cm-box-send"
              disabled={busy || (!text.trim() && pendingFiles.length === 0)}
              onClick={() => post(text, undefined, pendingFiles)}
              aria-label="Send"
              data-tip="Send"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
