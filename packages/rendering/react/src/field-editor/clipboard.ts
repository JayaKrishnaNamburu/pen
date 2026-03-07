import type { Editor, Position, DocumentOp } from "@pen/core";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";
import type { PasteImporters } from "../context/editorContext.js";

/**
 * Paste handler. Priority: pen-blocks > HTML > plain text.
 */
export function handlePaste(
  event: InputEvent,
  editor: Editor,
  fieldEditor: FieldEditorImpl,
  importers?: PasteImporters,
): void {
  const dataTransfer = (event as any).dataTransfer as DataTransfer | null;
  if (!dataTransfer) return;

  editor.deleteSelection();

  const sel = editor.selection;
  const position: Position | undefined =
    sel?.type === "text" ? { after: sel.anchor.blockId } : undefined;

  const penPayload = dataTransfer.getData("application/x-pen-blocks");
  if (penPayload) {
    try {
      const blocks = JSON.parse(penPayload);
      applyPastedBlocks(editor, blocks, position);
      return;
    } catch {
      /* fall through */
    }
  }

  const html = dataTransfer.getData("text/html");
  if (html) {
    const penMatch = html.match(/data-pen-blocks="([^"]*)"/);
    if (penMatch) {
      try {
        const blocks = JSON.parse(atob(penMatch[1]));
        applyPastedBlocks(editor, blocks, position);
        return;
      } catch {
        /* fall through to HTML import */
      }
    }

    if (importers?.html) {
      importers.html.import(html, editor, { undoGroup: true, position });
      return;
    }
  }

  const text = dataTransfer.getData("text/plain");
  if (text && importers?.markdown) {
    importers.markdown.import(text, editor, { undoGroup: true, position });
  }
}

/**
 * Copy handler. Serializes selected blocks to three MIME types.
 */
export function handleCopy(editor: Editor): void {
  const selection = editor.selection;
  if (!selection) return;

  const blocks = editor.getSelectedBlocks();
  if (blocks.length === 0) return;

  const htmlParts: string[] = [];
  const mdParts: string[] = [];
  const penBlocks: unknown[] = [];

  for (const block of blocks) {
    const schema = editor.schema.resolve(block.type);
    if (schema?.serialize?.toHTML) {
      htmlParts.push(schema.serialize.toHTML(block as any));
    }
    if (schema?.serialize?.toMarkdown) {
      mdParts.push(schema.serialize.toMarkdown(block as any));
    }
    penBlocks.push({
      type: block.type,
      props: block.props,
      content: block.textContent(),
    });
  }

  const htmlContent = htmlParts.join("\n");
  const penBlocksJson = JSON.stringify(penBlocks);
  const htmlWithPenData = `<meta data-pen-blocks="${btoa(penBlocksJson)}" />${htmlContent}`;

  navigator.clipboard.write([
    new ClipboardItem({
      "application/x-pen-blocks": new Blob([penBlocksJson], { type: "application/x-pen-blocks" }),
      "text/html": new Blob([htmlWithPenData], { type: "text/html" }),
      "text/plain": new Blob([mdParts.join("\n")], { type: "text/plain" }),
    }),
  ]);
}

/**
 * Cut handler. Copy + delete selection.
 */
export function handleCut(editor: Editor): void {
  handleCopy(editor);
  editor.deleteSelection();
}

/**
 * Apply a list of pasted pen blocks as a single undo group.
 * Each block in the array is expected to have { type, props, content? }.
 */
function applyPastedBlocks(
  editor: Editor,
  blocks: unknown[],
  position?: Position,
): void {
  if (!Array.isArray(blocks) || blocks.length === 0) return;

  const ops: DocumentOp[] = [];
  let prevBlockId: string | null = null;

  for (const raw of blocks) {
    if (!raw || typeof raw !== "object") continue;

    const { type, props, content } = raw as {
      type?: string;
      props?: Record<string, unknown>;
      content?: string;
    };

    if (!type) continue;

    const schema = editor.schema.resolve(type);
    if (!schema) continue;

    const blockId = crypto.randomUUID();

    const blockPosition: Position = prevBlockId
      ? { after: prevBlockId }
      : position ?? "last";

    ops.push({
      type: "insert-block",
      blockId,
      blockType: type,
      props: props ?? {},
      position: blockPosition,
    });

    if (content && typeof content === "string" && schema.content === "inline") {
      ops.push({
        type: "insert-text",
        blockId,
        offset: 0,
        text: content,
      });
    }

    prevBlockId = blockId;
  }

  if (ops.length > 0) {
    editor.apply(ops, { origin: "user", undoGroup: true });
  }
}
