import type {
  BlockHandle,
  Exporter,
  ExportOptions,
  Editor,
  InlineDelta,
} from "@pen/types";
import { buildDatabaseData } from "@pen/markdown-serialization";
import type {
  PenBlockJSON,
  PenDocumentJSON,
  PenInlineContentJSON,
  PenInlineSegmentJSON,
  PenJsonExportExtraOptions,
  PenMarkJSON,
} from "./types";
import { PEN_DOCUMENT_JSON_VERSION } from "./schema";

const ZERO_WIDTH_SPACE = "\u200B";

export const jsonExporter: Exporter<
  PenDocumentJSON,
  PenJsonExportExtraOptions
> = {
  name: "json",
  mimeType: "application/json",
  fileExtension: ".json",

  export(
    editor: Editor,
    options?: ExportOptions<PenJsonExportExtraOptions>,
  ): PenDocumentJSON {
    return exportEditorToJson(editor, options);
  },
};

export function exportEditorToJson(
  editor: Editor,
  options?: ExportOptions<PenJsonExportExtraOptions>,
): PenDocumentJSON {
  const blocks = [...editor.documentState.allBlocks()]
    .filter((handle) => handle.parent === null)
    .map((handle) => serializeBlock(handle));

  return {
    version: PEN_DOCUMENT_JSON_VERSION,
    ...(options?.includeMetadata && options.extra?.metadata
      ? { metadata: options.extra.metadata }
      : {}),
    blocks,
  };
}

function serializeBlock(handle: BlockHandle): PenBlockJSON {
  const block: PenBlockJSON = {
    id: handle.id,
    type: handle.type,
    props: { ...handle.props },
  };

  const inline = serializeInlineContent(handle.inlineDeltas());
  if (inline) {
    block.content = inline;
  }

  if (handle.type === "table") {
    const children = serializeTableChildren(handle);
    if (children.length > 0) {
      block.children = children;
    }
    return block;
  }

  if (handle.type === "database") {
    const database = buildDatabaseData(handle);
    if (database) {
      block.database = database;
    }
    return block;
  }

  if (handle.children.length > 0) {
    block.children = handle.children.map((child) => serializeBlock(child));
  }

  return block;
}

function serializeTableChildren(handle: BlockHandle): PenBlockJSON[] {
  const rowCount = handle.tableRowCount();
  const colCount = handle.tableColumnCount();
  const rows: PenBlockJSON[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const cells: PenBlockJSON[] = [];

    for (let colIndex = 0; colIndex < colCount; colIndex += 1) {
      const cell = handle.tableCell(rowIndex, colIndex);
      const inline = cell ? serializeInlineContent(cell.inlineDeltas()) : undefined;
      const cellJson: PenBlockJSON = {
        id: `cell-${rowIndex}-${colIndex}`,
        type: "__table_cell",
        props: {},
      };

      if (inline) {
        cellJson.content = inline;
      }

      cells.push(cellJson);
    }

    rows.push({
      id: `row-${rowIndex}`,
      type: "__table_row",
      props: {},
      children: cells,
    });
  }

  return rows;
}

function serializeInlineContent(
  deltas: InlineDelta[],
): PenInlineContentJSON | undefined {
  const visibleDeltas = deltas.filter(
    (delta) => typeof delta.insert !== "string" || delta.insert !== ZERO_WIDTH_SPACE,
  );
  const textDeltas: Array<{ insert: string; attributes?: Record<string, unknown> }> =
    visibleDeltas.flatMap((delta) =>
      typeof delta.insert === "string"
        ? [{
            insert: delta.insert,
            ...(delta.attributes ? { attributes: delta.attributes } : {}),
          }]
        : [],
    );
  const text = textDeltas.map((delta) => delta.insert).join("");
  const marks = serializeMarks(textDeltas);
  const segments = serializeSegments(visibleDeltas);

  if (text.length === 0 && marks.length === 0 && segments.length === 0) {
    return undefined;
  }

  return {
    text,
    ...(marks.length > 0 ? { marks } : {}),
    ...(segments.length > 0 ? { segments } : {}),
  };
}

function serializeSegments(deltas: InlineDelta[]): PenInlineSegmentJSON[] {
  const segments: PenInlineSegmentJSON[] = [];

  for (const delta of deltas) {
    if (typeof delta.insert === "string") {
      if (delta.insert.length === 0) {
        continue;
      }
      segments.push({
        type: "text",
        text: delta.insert,
        ...(delta.attributes ? { attributes: delta.attributes } : {}),
      });
      continue;
    }

    segments.push({
      type: "node",
      nodeType: delta.insert.type,
      ...(Object.keys(delta.insert.props).length > 0
        ? { props: delta.insert.props }
        : {}),
    });
  }

  return segments;
}

function serializeMarks(
  deltas: Array<{ insert: string; attributes?: Record<string, unknown> }>,
): PenMarkJSON[] {
  const marks: PenMarkJSON[] = [];
  let offset = 0;

  for (const delta of deltas) {
    const length = delta.insert.length;
    const deltaOffset = offset;
    offset += length;

    if (length === 0 || !delta.attributes) {
      continue;
    }

    for (const [type, value] of Object.entries(delta.attributes)) {
      if (value == null || value === false) {
        continue;
      }

      marks.push({
        type,
        start: deltaOffset,
        end: deltaOffset + length,
        ...(isRecord(value) ? { props: value } : {}),
      });
    }
  }

  return marks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
