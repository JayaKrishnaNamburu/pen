import { useState, useSyncExternalStore } from "react";
import { markdownExporter } from "@pen/export-markdown";
import { htmlExporter } from "@pen/export-html";
import { markdownImporter } from "@pen/import-markdown";
import { htmlImporter } from "@pen/import-html";
import {
  Pen,
  useEditor,
  type PasteImporters,
} from "@pen/react";
import type { Editor } from "@pen/core";

const BLOCK_TYPE_OPTIONS = [
  { value: "paragraph", label: "Paragraph" },
  { value: "heading", label: "Heading" },
  { value: "bullet-list-item", label: "Bullet list" },
  { value: "numbered-list-item", label: "Numbered list" },
  { value: "check-list-item", label: "Checklist" },
  { value: "code-block", label: "Code" },
  { value: "blockquote", label: "Quote" },
  { value: "callout", label: "Callout" },
  { value: "toggle", label: "Toggle" },
];

const IMPORTERS: PasteImporters = {
  html: htmlImporter,
  markdown: markdownImporter,
};

type ToolbarIconName =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "undo2"
  | "redo2";

export function App() {
  const editor = useEditor();
  const [inspectorOpen, setInspectorOpen] = useState(true);

  return (
    <div className="playground">
      <div className="playground-body">
        <Pen.Editor.Root editor={editor} importers={IMPORTERS}>
          <Topbar
            editor={editor}
            inspectorOpen={inspectorOpen}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
          />

          <div className="playground-editor">
            <Pen.Editor.Content />
            <SlashMenu />
          </div>

        </Pen.Editor.Root>
      </div>

      {inspectorOpen && (
        <div className="playground-inspector">
          <header className="topbar">
            <div className="topbar-left">
              <span className="topbar-title">Document</span>
            </div>
          </header>
          <Inspector editor={editor} />
        </div>
      )}
    </div>
  );
}

function Topbar({
  editor,
  inspectorOpen,
  onToggleInspector,
}: {
  editor: Editor;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}) {
  const handleExportMarkdown = () => {
    const md = markdownExporter.export(editor, {});
    navigator.clipboard.writeText(md as string);
  };

  const handleExportHtml = () => {
    const html = htmlExporter.export(editor, {});
    navigator.clipboard.writeText(html as string);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">Pen</span>
        <span className="topbar-badge">Playground</span>
      </div>

      <div className="topbar-center">
        <Pen.Toolbar.Root editor={editor}>
          <Pen.Toolbar.Group>
            <Pen.Toolbar.Toggle format="bold">
              <ToolbarIcon name="bold" />
            </Pen.Toolbar.Toggle>
            <Pen.Toolbar.Toggle format="italic">
              <ToolbarIcon name="italic" />
            </Pen.Toolbar.Toggle>
            <Pen.Toolbar.Toggle format="underline">
              <ToolbarIcon name="underline" />
            </Pen.Toolbar.Toggle>
            <Pen.Toolbar.Toggle format="strikethrough">
              <ToolbarIcon name="strikethrough" />
            </Pen.Toolbar.Toggle>
            <Pen.Toolbar.Toggle format="code">
              <ToolbarIcon name="code" />
            </Pen.Toolbar.Toggle>
          </Pen.Toolbar.Group>
          <Pen.Toolbar.Separator />
          <Pen.Toolbar.Select
            format="blockType"
            options={BLOCK_TYPE_OPTIONS}
          />
        </Pen.Toolbar.Root>
      </div>

      <div className="topbar-right">
        <button
          className="topbar-btn"
          onClick={() => editor.undoManager.undo()}
          type="button"
          title="Undo"
          aria-label="Undo"
        >
          <ToolbarIcon name="undo2" className="topbar-icon" />
        </button>
        <button
          className="topbar-btn"
          onClick={() => editor.undoManager.redo()}
          type="button"
          title="Redo"
          aria-label="Redo"
        >
          <ToolbarIcon name="redo2" className="topbar-icon" />
        </button>
        <span className="topbar-sep" />
        <button
          className="topbar-btn"
          onClick={handleExportMarkdown}
          type="button"
          title="Copy as Markdown"
        >
          MD
        </button>
        <button
          className="topbar-btn"
          onClick={handleExportHtml}
          type="button"
          title="Copy as HTML"
        >
          HTML
        </button>
        <span className="topbar-sep" />
        <button
          className="topbar-btn"
          onClick={onToggleInspector}
          type="button"
          data-active={inspectorOpen || undefined}
          title="Toggle inspector"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14">
            <path
              d="M 2 4.75 C 2 4.336 2.336 4 2.75 4 L 11.25 4 C 11.664 4 12 4.336 12 4.75 L 12 4.75 C 12 5.164 11.664 5.5 11.25 5.5 L 2.75 5.5 C 2.336 5.5 2 5.164 2 4.75 Z"
              fill="currentColor"
            />
            <path
              d="M 2 9.25 C 2 8.836 2.336 8.5 2.75 8.5 L 11.25 8.5 C 11.664 8.5 12 8.836 12 9.25 L 12 9.25 C 12 9.664 11.664 10 11.25 10 L 2.75 10 C 2.336 10 2 9.664 2 9.25 Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </header>
  );
}

function ToolbarIcon({
  name,
  className = "toolbar-icon",
}: {
  name: ToolbarIconName;
  className?: string;
}) {
  const sharedProps = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };

  switch (name) {
    case "bold":
      return (
        <svg {...sharedProps}>
          <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
        </svg>
      );
    case "italic":
      return (
        <svg {...sharedProps}>
          <line x1="19" x2="10" y1="4" y2="4" />
          <line x1="14" x2="5" y1="20" y2="20" />
          <line x1="15" x2="9" y1="4" y2="20" />
        </svg>
      );
    case "underline":
      return (
        <svg {...sharedProps}>
          <path d="M6 4v6a6 6 0 0 0 12 0V4" />
          <line x1="4" x2="20" y1="20" y2="20" />
        </svg>
      );
    case "strikethrough":
      return (
        <svg {...sharedProps}>
          <path d="M16 4H9a3 3 0 0 0-2.83 4" />
          <path d="M14 12a4 4 0 0 1 0 8H6" />
          <line x1="4" x2="20" y1="12" y2="12" />
        </svg>
      );
    case "code":
      return (
        <svg {...sharedProps}>
          <path d="m16 18 6-6-6-6" />
          <path d="m8 6-6 6 6 6" />
        </svg>
      );
    case "undo2":
      return (
        <svg {...sharedProps}>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
        </svg>
      );
    case "redo2":
      return (
        <svg {...sharedProps}>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13" />
        </svg>
      );
  }
}

function SlashMenu() {
  return (
    <Pen.SlashMenu.Root>
      <Pen.SlashMenu.List />
    </Pen.SlashMenu.Root>
  );
}

function Inspector({ editor }: { editor: Editor }) {
  const debugJson = useSyncExternalStore(
    (callback) => subscribeToInspectorUpdates(editor, callback),
    () => JSON.stringify(serializeEditorState(editor), null, 2),
    () => JSON.stringify(serializeEditorState(editor), null, 2),
  );

  return (
    <div className="inspector">
      <pre className="inspector-json">{debugJson}</pre>
    </div>
  );
}

function subscribeToInspectorUpdates(
  editor: Editor,
  callback: () => void,
): () => void {
  let rafId: number | null = null;

  const notify = () => {
    if (rafId != null) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      callback();
    });
  };

  const unsubscribers = [
    editor.on("change", notify),
    editor.on("documentChange", notify),
    editor.on("selectionChange", notify),
  ];

  const ownerDocument =
    typeof document === "undefined" ? null : document;
  const handleSelectionChange = () => notify();
  ownerDocument?.addEventListener("selectionchange", handleSelectionChange);

  const editorRoot = ownerDocument?.querySelector(
    "[data-pen-editor-root]",
  );
  let observer: MutationObserver | null = null;

  if (editorRoot instanceof HTMLElement) {
    observer = new MutationObserver(() => notify());
    observer.observe(editorRoot, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  }

  return () => {
    if (rafId != null) {
      window.cancelAnimationFrame(rafId);
    }

    observer?.disconnect();
    ownerDocument?.removeEventListener(
      "selectionchange",
      handleSelectionChange,
    );

    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}

function serializeEditorState(editor: Editor) {
  const blockIds = editor.documentState.blockOrder;
  const selection = editor.selection;
  const serializedSelection = selection
    ? selection.type === "text"
      ? {
        type: selection.type,
        blockId: selection.anchor.blockId,
        anchor: selection.anchor.offset,
        focus: selection.focus.offset,
        collapsed: selection.isCollapsed,
      }
      : selection.type === "block"
        ? {
          type: selection.type,
          blockIds: selection.blockIds,
        }
        : selection.type === "cell"
          ? {
            type: selection.type,
            blockId: selection.blockId,
            anchor: selection.anchor,
            head: selection.head,
          }
          : {
            type: selection.type,
            appId: selection.appId,
          }
    : null;

  return {
    blockCount: blockIds.length,
    selection: serializedSelection,
    blocks: blockIds.map((id) => {
      const block = editor.getBlock(id);
      if (!block) return { id, type: "?" };
      return {
        id: block.id,
        type: block.type,
        props: block.props,
        text: block.textContent(),
      };
    }),
  };
}
