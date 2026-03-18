import type {
  BlockHandle,
  Editor,
  Exporter,
  ExportOptions,
  TableCellHandle,
} from "@pen/types";
import {
  buildDatabaseData,
  sortDeltaAttributes,
} from "@pen/markdown-serialization";

export type HtmlExportViewMode = "resolved" | "raw";

type HtmlExporterExtraOptions = Record<string, unknown> & {
  viewMode?: HtmlExportViewMode;
};

const ZERO_WIDTH_SPACE = "\u200B";
const DELETE_SUGGESTION_ACTION = "delete";

export const htmlExporter: Exporter<string, HtmlExporterExtraOptions> = {
  name: "html",
  mimeType: "text/html",
  fileExtension: ".html",

  export(editor: Editor, options?: ExportOptions<HtmlExporterExtraOptions>): string {
    const viewMode =
      options?.extra?.viewMode ??
      (options?.includeSuggestions === false ? "resolved" : "raw");
    // Export is a document-preservation surface: serialize the actual document
    // graph, including nested and non-default-authoring blocks that already exist.
    const handles = [...editor.documentState.allBlocks()];
    const parts: string[] = [];
    for (let index = 0; index < handles.length; index++) {
      const handle = handles[index]!;

      if (isListHandle(handle)) {
        const { html, nextIndex } = renderListRunHTML(
          handles,
          index,
          editor,
          viewMode,
        );
        parts.push(html);
        index = nextIndex - 1;
        continue;
      }

      if (handle.type === "table") {
        parts.push(renderTableHTML(handle, editor, viewMode));
        continue;
      }

      const schema = editor.schema.resolve(handle.type);
      if (!schema?.serialize?.toHTML) {
        parts.push(`<p>${escapeHTML(handle.textContent())}</p>`);
        continue;
      }

      const block = {
        id: handle.id,
        type: handle.type,
        props: handle.props,
        content: serializeInlineContentHTML(handle, editor, viewMode),
        ...(handle.type === "database"
          ? { databaseData: buildDatabaseData(handle) }
          : {}),
      };

      parts.push(schema.serialize.toHTML(block));
    }

    return parts.join("\n");
  },
};

function serializeInlineContentHTML(
  handle: BlockHandle,
  editor: Editor,
  viewMode: HtmlExportViewMode,
): string {
  const deltas = handle.textDeltas();
  if (!deltas || deltas.length === 0) {
    return escapeHTML(
      viewMode === "resolved"
        ? handle.textContent({ resolved: true })
        : handle.textContent(),
    );
  }

  let result = "";

  for (const delta of deltas) {
    let text =
      typeof delta.insert === "string" ? escapeHTML(delta.insert) : "";
    if (delta.insert === ZERO_WIDTH_SPACE) continue;

    const suggestion = delta.attributes?.suggestion as
      | { action?: string }
      | undefined;
    if (viewMode === "resolved" && suggestion?.action === DELETE_SUGGESTION_ACTION) {
      continue;
    }

    if (delta.attributes) {
      const ordered = sortDeltaAttributes(delta.attributes, editor.schema);
      const marks = Object.entries(ordered);
      for (const [mark, props] of marks) {
        if (viewMode === "resolved" && mark === "suggestion") {
          continue;
        }
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

function renderTableHTML(
  handle: BlockHandle,
  editor: Editor,
  viewMode: HtmlExportViewMode,
): string {
  const rowCount = handle.tableRowCount();
  const colCount = handle.tableColumnCount();
  const hasHeaderRow = handle.props.hasHeaderRow !== false;
  const parts = ["<table>"];

  if (hasHeaderRow && rowCount > 0) {
    parts.push("<thead><tr>");
    for (let columnIndex = 0; columnIndex < colCount; columnIndex++) {
      parts.push(
        `<th>${serializeTableCellHTML(handle.tableCell(0, columnIndex), editor, viewMode)}</th>`,
      );
    }
    parts.push("</tr></thead>");
  }

  const bodyStart = hasHeaderRow ? 1 : 0;
  if (bodyStart < rowCount) {
    parts.push("<tbody>");
    for (let rowIndex = bodyStart; rowIndex < rowCount; rowIndex++) {
      parts.push("<tr>");
      for (let columnIndex = 0; columnIndex < colCount; columnIndex++) {
        parts.push(
          `<td>${serializeTableCellHTML(handle.tableCell(rowIndex, columnIndex), editor, viewMode)}</td>`,
        );
      }
      parts.push("</tr>");
    }
    parts.push("</tbody>");
  }

  parts.push("</table>");
  return parts.join("");
}

function serializeTableCellHTML(
  cell: TableCellHandle | null,
  editor: Editor,
  viewMode: HtmlExportViewMode,
): string {
  if (!cell) {
    return "";
  }

  let result = "";
  for (const delta of cell.textDeltas()) {
    let text = typeof delta.insert === "string" ? escapeHTML(delta.insert) : "";
    if (delta.insert === ZERO_WIDTH_SPACE) {
      continue;
    }

    const suggestion = delta.attributes?.suggestion as
      | { action?: string }
      | undefined;
    if (viewMode === "resolved" && suggestion?.action === DELETE_SUGGESTION_ACTION) {
      continue;
    }

    if (delta.attributes) {
      const ordered = sortDeltaAttributes(delta.attributes, editor.schema);
      for (const [mark, props] of Object.entries(ordered)) {
        if (viewMode === "resolved" && mark === "suggestion") {
          continue;
        }
        const inlineSchema = editor.schema.resolveInline(mark);
        if (!inlineSchema?.serialize?.toHTML) {
          continue;
        }
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

function isListHandle(handle: BlockHandle): boolean {
  return (
    handle.type === "bulletListItem" ||
    handle.type === "numberedListItem" ||
    handle.type === "checkListItem"
  );
}

function renderListRunHTML(
  handles: BlockHandle[],
  startIndex: number,
  editor: Editor,
  viewMode: HtmlExportViewMode,
): { html: string; nextIndex: number } {
  const run: BlockHandle[] = [];
  let index = startIndex;
  while (index < handles.length && isListHandle(handles[index]!)) {
    run.push(handles[index]!);
    index += 1;
  }

  let html = "";
  const stack: Array<{ tag: "ul" | "ol"; indent: number }> = [];

  for (let itemIndex = 0; itemIndex < run.length; itemIndex++) {
    const handle = run[itemIndex]!;
    const indent = Number(handle.props.indent ?? 0);
    const tag = handle.type === "numberedListItem" ? "ol" : "ul";

    if (stack.length === 0) {
      html += `<${tag}>`;
      stack.push({ tag, indent });
    } else {
      let top = stack[stack.length - 1]!;
      if (indent > top.indent) {
        html += `<${tag}>`;
        stack.push({ tag, indent });
        top = stack[stack.length - 1]!;
      } else {
        html += "</li>";
        while (stack.length > 0 && indent < stack[stack.length - 1]!.indent) {
          html += `</${stack.pop()!.tag}></li>`;
        }
        if (stack.length === 0 || stack[stack.length - 1]!.tag !== tag) {
          if (stack.length > 0) {
            html += `</${stack.pop()!.tag}>`;
          }
          html += `<${tag}>`;
          stack.push({ tag, indent });
        }
      }
    }

    html += `<li>${renderListItemInnerHTML(handle, editor, viewMode)}`;
  }

  while (stack.length > 0) {
    html += `</li></${stack.pop()!.tag}>`;
  }

  return { html, nextIndex: index };
}

function renderListItemInnerHTML(
  handle: BlockHandle,
  editor: Editor,
  viewMode: HtmlExportViewMode,
): string {
  const schema = editor.schema.resolve(handle.type);
  if (!schema?.serialize?.toHTML) {
    return escapeHTML(handle.textContent());
  }

  const block = {
    id: handle.id,
    type: handle.type,
    props: handle.props,
    content: serializeInlineContentHTML(handle, editor, viewMode),
  };
  const html = schema.serialize.toHTML(block);
  return html.replace(/^<li>/, "").replace(/<\/li>$/, "");
}
