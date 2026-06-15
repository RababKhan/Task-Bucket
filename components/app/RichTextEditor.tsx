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
          "Copied!"
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
            Copy
          </>
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

function HeadingMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const current = editor.isActive("heading", { level: 1 })
    ? "H1"
    : editor.isActive("heading", { level: 2 })
    ? "H2"
    : editor.isActive("heading", { level: 3 })
    ? "H3"
    : "T";

  const items: { label: string; run: () => void }[] = [
    { label: "Normal text", run: () => editor.chain().focus().setParagraph().run() },
    { label: "Heading 1", run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { label: "Heading 2", run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Heading 3", run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  ];

  return (
    <div className="rte-heading">
      <button
        type="button"
        className={`rte-tool rte-heading-btn${current !== "T" ? " active" : ""}`}
        title="Text style"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        <span className="rte-heading-cur">{current}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <>
          <div className="rte-heading-backdrop" onMouseDown={() => setOpen(false)} />
          <div className="rte-heading-menu">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                className="rte-heading-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  it.run();
                  setOpen(false);
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  // Force the toolbar to re-render on selection/content changes so the active
  // states stay in sync (TipTap v3 doesn't re-render on every transaction).
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const editorRef = useRef<Editor | null>(null);

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
      CustomCodeBlock,
      Image.configure({ inline: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
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

  // Sync external value changes (e.g. switching tasks) when not editing.
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getHTML() !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="rte rte-loading" />;
  }

  function link() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "");
    if (url === null) return;
    if (url === "") {
      editor!.chain().focus().unsetLink().run();
    } else {
      editor!.chain().focus().setLink({ href: url }).run();
    }
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <HeadingMenu editor={editor} />
        <span className="rte-sep" />
        <ToolBtn active={editor.isActive("bold")} title="Bold" onClick={() => editor.chain().focus().toggleBold().run()}>
          <span style={{ fontWeight: 700 }}>B</span>
        </ToolBtn>
        <ToolBtn active={editor.isActive("italic")} title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span style={{ fontStyle: "italic" }}>I</span>
        </ToolBtn>
        <ToolBtn active={editor.isActive("underline")} title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span style={{ textDecoration: "underline" }}>U</span>
        </ToolBtn>
        <span className="rte-sep" />
        <ToolBtn active={editor.isActive("orderedList")} title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 16H4l2 2-2 2h2" />
          </svg>
        </ToolBtn>
        <ToolBtn active={editor.isActive("bulletList")} title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </ToolBtn>
        <span className="rte-sep" />
        <ToolBtn active={editor.isActive("taskList")} title="Checklist" onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="m8 12 3 3 5-6" />
          </svg>
        </ToolBtn>
        <ToolBtn title="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        </ToolBtn>
        <ToolBtn active={editor.isActive("codeBlock")} title="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m8 16-4-4 4-4M16 8l4 4-4 4" />
          </svg>
        </ToolBtn>
        <ToolBtn active={editor.isActive("link")} title="Link" onClick={link}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
            <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
          </svg>
        </ToolBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
