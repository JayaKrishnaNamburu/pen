import type { Exporter, ExportOptions, Editor, BlockHandle } from "@pen/core";
import { sortDeltaAttributes } from "@pen/core";

export const htmlExporter: Exporter<string> = {
  name: "html",
  mimeType: "text/html",
  fileExtension: ".html",

  export(editor: Editor, _options?: ExportOptions): string {
    const parts: string[] = [];
    for (const handle of editor.documentState.allBlocks()) {

      const schema = editor.schema.resolve(handle.type);
      if (!schema?.serialize?.toHTML) {
        parts.push(`<p>${escapeHTML(handle.textContent())}</p>`);
        continue;
      }

      const block = {
        id: handle.id,
        type: handle.type,
        props: handle.props,
        content: serializeInlineContentHTML(handle, editor),
      };

      parts.push(schema.serialize.toHTML(block));
    }

    return parts.join("\n");
  },
};

function serializeInlineContentHTML(
  handle: BlockHandle,
  editor: Editor,
): string {
  const deltas = handle.textDeltas();
  if (!deltas || deltas.length === 0) return escapeHTML(handle.textContent());

  let result = "";

  for (const delta of deltas) {
    let text =
      typeof delta.insert === "string" ? escapeHTML(delta.insert) : "";
    if (delta.insert === "\u200B") continue;

    if (delta.attributes) {
      const ordered = sortDeltaAttributes(delta.attributes, editor.schema);
      const marks = Object.entries(ordered);
      for (const [mark, props] of marks) {
        const inlineSchema = editor.schema.resolveInline(mark);
        if (!inlineSchema?.serialize?.toHTML) continue;
        text = inlineSchema.serialize.toHTML(
          text,
          typeof props === "object" ? (props as Record<string, unknown>) : {},
        );
      }
    }

    result += text;
  }

  return result;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
