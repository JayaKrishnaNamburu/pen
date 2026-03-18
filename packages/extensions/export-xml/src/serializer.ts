import type {
  PenBlockJSON,
  PenDocumentJSON,
  PenInlineContentJSON,
  PenInlineSegmentJSON,
  PenMarkJSON,
} from "@pen/export-json";

const INDENT = "  ";

export function serializePenDocumentToXml(document: PenDocumentJSON): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  lines.push(`<pen-document version="${document.version}">`);

  if (document.metadata) {
    lines.push(`${INDENT}<metadata>${escapeXml(JSON.stringify(document.metadata))}</metadata>`);
  }

  for (const block of document.blocks) {
    lines.push(...serializeBlock(block, 1));
  }

  lines.push(`</pen-document>`);
  return lines.join("\n");
}

function serializeBlock(block: PenBlockJSON, depth: number): string[] {
  const indent = INDENT.repeat(depth);
  const lines: string[] = [
    `${indent}<block id="${escapeXml(block.id)}" type="${escapeXml(block.type)}">`,
    `${indent}${INDENT}<props>${escapeXml(JSON.stringify(block.props ?? {}))}</props>`,
  ];

  if (block.content) {
    lines.push(...serializeInlineContent(block.content, depth + 1));
  }

  if (block.database) {
    lines.push(
      `${indent}${INDENT}<database>${escapeXml(JSON.stringify(block.database))}</database>`,
    );
  }

  if (block.children && block.children.length > 0) {
    lines.push(`${indent}${INDENT}<children>`);
    for (const child of block.children) {
      lines.push(...serializeBlock(child, depth + 2));
    }
    lines.push(`${indent}${INDENT}</children>`);
  }

  lines.push(`${indent}</block>`);
  return lines;
}

function serializeInlineContent(
  content: PenInlineContentJSON,
  depth: number,
): string[] {
  const indent = INDENT.repeat(depth);
  const lines = [`${indent}<content>${escapeXml(content.text)}</content>`];

  if (content.marks && content.marks.length > 0) {
    lines.push(`${indent}<marks>`);
    for (const mark of content.marks) {
      lines.push(serializeMark(mark, depth + 1));
    }
    lines.push(`${indent}</marks>`);
  }

  if (content.segments && content.segments.length > 0) {
    lines.push(`${indent}<segments>`);
    for (const segment of content.segments) {
      lines.push(serializeInlineSegment(segment, depth + 1));
    }
    lines.push(`${indent}</segments>`);
  }

  return lines;
}

function serializeInlineSegment(
  segment: PenInlineSegmentJSON,
  depth: number,
): string {
  const indent = INDENT.repeat(depth);
  if (segment.type === "text") {
    const attributesAttribute = segment.attributes
      ? ` attributes="${escapeXml(JSON.stringify(segment.attributes))}"`
      : "";
    return `${indent}<text${attributesAttribute}>${escapeXml(segment.text)}</text>`;
  }

  const propsAttribute = segment.props
    ? ` props="${escapeXml(JSON.stringify(segment.props))}"`
    : "";
  return `${indent}<node type="${escapeXml(segment.nodeType)}"${propsAttribute} />`;
}

function serializeMark(mark: PenMarkJSON, depth: number): string {
  const indent = INDENT.repeat(depth);
  const propsAttribute = mark.props
    ? ` props="${escapeXml(JSON.stringify(mark.props))}"`
    : "";

  return `${indent}<mark type="${escapeXml(mark.type)}" start="${mark.start}" end="${mark.end}"${propsAttribute} />`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
