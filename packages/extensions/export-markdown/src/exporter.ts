import type { Exporter, ExportOptions, Editor, BlockHandle } from "@pen/core";
import { sortDeltaAttributes } from "@pen/core";
import { groupListItems } from "./listGrouper.js";

export const markdownExporter: Exporter<string> = {
  name: "markdown",
  mimeType: "text/markdown",
  fileExtension: ".md",

  export(editor: Editor, _options?: ExportOptions): string {
    const lines: string[] = [];
    for (const handle of editor.documentState.allBlocks()) {

      const schema = editor.schema.resolve(handle.type);
      if (!schema?.serialize?.toMarkdown) {
        lines.push(handle.textContent());
        continue;
      }

      const block = {
        id: handle.id,
        type: handle.type,
        props: handle.props,
        content: serializeInlineContent(handle, editor),
      };

      lines.push(schema.serialize.toMarkdown(block));
    }

    return groupListItems(lines).join("\n\n");
  },
};

function serializeInlineContent(handle: BlockHandle, editor: Editor): string {
  const deltas = handle.textDeltas();
  if (!deltas || deltas.length === 0) return handle.textContent();

  let result = "";

  for (const delta of deltas) {
    let text = typeof delta.insert === "string" ? delta.insert : "";
    if (text === "\u200B") continue;

    if (delta.attributes) {
      const ordered = sortDeltaAttributes(delta.attributes, editor.schema);
      const marks = Object.entries(ordered);
      for (const [mark, props] of marks) {
        const inlineSchema = editor.schema.resolveInline(mark);
        if (!inlineSchema?.serialize?.toMarkdown) continue;
        text = inlineSchema.serialize.toMarkdown(
          text,
          typeof props === "object" ? (props as Record<string, unknown>) : {},
        );
      }
    }

    result += text;
  }

  return result;
}
