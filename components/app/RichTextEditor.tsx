"use client";

import { useEffect, useRef, useState } from "react";
import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import CodeBlock from "@tiptap/extension-code-block";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";

function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(node.textContent ?? "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }
  return (
    <NodeViewWrapper className="rte-codeblock">
      <button
        type="button"
        className="rte-codeblock-copy"
        contentEditable={false}
        onClick={copy}
      >
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
      <pre>
        <NodeViewContent as={"code" as "div"} />
      </pre>
    </NodeViewWrapper>
  );
}

const CustomCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

function ToolBtn({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rte-tool${active ? " active" : ""}`}
      title={title}
      aria-label={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  toolbarBottom = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  toolbarBottom?: boolean;
  autoFocus?: boolean;
}) {
  // Force the toolbar to re-render on selection/content changes so the active
  // states stay in sync (TipTap v3 doesn't re-render on every transaction).
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const editorRef = useRef<Editor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  function insertImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = () =>
      editorRef.current
        ?.chain()
        .focus()
        .setImage({ src: reader.result as string })
        .run();
    reader.readAsDataURL(file);
  }

  function imagesFrom(list: FileList | null | undefined): File[] {
    return list
      ? Array.from(list).filter((f) => f.type.startsWith("image/"))
      : [];
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
        codeBlock: false,
      }),
      // Keep consecutive blank lines inside the block instead of exiting it.
      CustomCodeBlock.configure({ exitOnTripleEnter: false }),
      // allowBase64 so pasted/uploaded data-URL images survive HTML round-trips
      // (they're stripped on parse otherwise, disappearing after save/reload).
      Image.configure({ inline: false, allowBase64: true }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true, cellMinWidth: 40 }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "rte-content",
      },
      handlePaste: (_view, event) => {
        const imgs = imagesFrom(event.clipboardData?.files);
        if (imgs.length) {
          imgs.forEach(insertImageFile);
          return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const imgs = imagesFrom((event as DragEvent).dataTransfer?.files);
        if (imgs.length) {
          event.preventDefault();
          imgs.forEach(insertImageFile);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      bump();
    },
    onSelectionUpdate: () => bump(),
    onBlur: () => onBlur?.(),
  });
  editorRef.current = editor;

  // Load the current value when the editor (re)mounts (e.g. opening the
  // description editor), in case the initial `content` didn't take.
  useEffect(() => {
    if (editor && value && editor.isEmpty) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // Drop the cursor inside the editor (at the end of any existing content)
    // so clicking "edit" lets the user type immediately.
    if (editor && autoFocus) {
      editor.commands.focus("end");
    }
    // Only when the editor instance changes (mount); value handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Sync external value changes (e.g. switching tasks) when not editing.
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="rte rte-loading" />;
  }

  function openLink() {
    setLinkUrl((editor!.getAttributes("link").href as string) ?? "");
    setLinkOpen(true);
  }
  function applyLink() {
    const url = linkUrl.trim();
    if (url) editor!.chain().focus().setLink({ href: url }).run();
    else editor!.chain().focus().unsetLink().run();
    setLinkOpen(false);
  }
  function removeLink() {
    editor!.chain().focus().unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div className={`rte${toolbarBottom ? " rte-bottom" : ""}`}>
      <div className="rte-toolbar">
        <span className="rte-group">
          <ToolBtn active={editor.isActive("bold")} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
            <span style={{ fontWeight: 700 }}>B</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive("italic")} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span style={{ fontStyle: "italic" }}>I</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive("underline")} title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span style={{ textDecoration: "underline" }}>U</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive("strike")} title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()}>
            <span style={{ textDecoration: "line-through" }}>S</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive("highlight")} title="Highlight" onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 11-6 6v3h3l6-6" />
              <path d="m13 7 4 4" />
              <path d="m15 5 4 4-7 7-4-4Z" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive("code")} title="Inline code" onClick={() => editor.chain().focus().toggleCode().run()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m8 16-4-4 4-4M16 8l4 4-4 4" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive("codeBlock")} title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" />
            </svg>
          </ToolBtn>
        </span>
        <span className="rte-group">
          <ToolBtn active={editor.isActive("heading", { level: 1 })} title="Heading 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <span className="rte-h">H1</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive("heading", { level: 2 })} title="Heading 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <span className="rte-h">H2</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive("heading", { level: 3 })} title="Heading 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <span className="rte-h">H3</span>
          </ToolBtn>
        </span>
        <span className="rte-group">
          <ToolBtn active={editor.isActive("bulletList")} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive("orderedList")} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 16H4l2 2-2 2h2" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive("taskList")} title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="m8 12 3 3 5-6" />
            </svg>
          </ToolBtn>
        </span>
        <span className="rte-group">
          <ToolBtn active={editor.isActive("link") || linkOpen} title="Link" onClick={() => (linkOpen ? setLinkOpen(false) : openLink())}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
              <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
            </svg>
          </ToolBtn>
        </span>
      </div>

      {linkOpen && (
        <div className="rte-link-pop">
          <input
            autoFocus
            className="rte-link-input"
            value={linkUrl}
            placeholder="https://example.com"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                setLinkOpen(false);
              }
            }}
          />
          <button type="button" className="rte-link-apply" onMouseDown={(e) => { e.preventDefault(); applyLink(); }}>
            Apply
          </button>
          {editor.isActive("link") && (
            <button type="button" className="rte-link-remove" onMouseDown={(e) => { e.preventDefault(); removeLink(); }}>
              Remove
            </button>
          )}
        </div>
      )}

      {editor.isActive("table") && (
        <div className="rte-table-controls">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addColumnAfter().run(); }}>
            + Column
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteColumn().run(); }}>
            − Column
          </button>
          <span className="rte-table-sep" />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().addRowAfter().run(); }}>
            + Row
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteRow().run(); }}>
            − Row
          </button>
          <span className="rte-table-sep" />
          <button type="button" className="rte-table-del" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteTable().run(); }}>
            Delete table
          </button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
