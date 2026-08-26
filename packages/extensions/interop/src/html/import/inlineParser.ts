import type { DOMNode } from "./domAdapter";

interface InlineResult {
  text: string;
  marks: Array<{
    type: string;
    props?: Record<string, unknown>;
    start: number;
    end: number;
  }>;
}

const INLINE_MARK_MAP: Record<string, string> = {
  strong: "bold",
  b: "bold",
  em: "italic",
  i: "italic",
  u: "underline",
  s: "strikethrough",
  del: "strikethrough",
  strike: "strikethrough",
  code: "code",
  mark: "highlight",
};

export function parseInlineContent(node: DOMNode): InlineResult {
  const result: InlineResult = { text: "", marks: [] };
  walkInline(node, result);
  return result;
}

function walkInline(node: DOMNode, result: InlineResult): void {
  if (node.type === "text") {
    result.text += node.textContent ?? "";
    return;
  }

  if (node.type !== "element" || !node.tagName) {
    for (const child of node.children ?? []) walkInline(child, result);
    return;
  }

  const markType = INLINE_MARK_MAP[node.tagName];
  if (markType) {
    const start = result.text.length;
    for (const child of node.children ?? []) walkInline(child, result);
    result.marks.push({ type: markType, start, end: result.text.length });
    return;
  }

  if (node.tagName === "a") {
    const start = result.text.length;
    for (const child of node.children ?? []) walkInline(child, result);
    result.marks.push({
      type: "link",
      props: {
        href: node.attributes?.href ?? "",
        title: node.attributes?.title ?? undefined,
      },
      start,
      end: result.text.length,
    });
    return;
  }

  if (node.tagName === "span") {
    const style = node.attributes?.style ?? "";
    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    const bgMatch = style.match(
      /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i,
    );

    const start = result.text.length;
    for (const child of node.children ?? []) walkInline(child, result);
    const end = result.text.length;

    if (colorMatch) {
      result.marks.push({
        type: "textColor",
        props: { color: colorMatch[1].trim() },
        start,
        end,
      });
    }
    if (bgMatch) {
      result.marks.push({
        type: "backgroundColor",
        props: { color: bgMatch[1].trim() },
        start,
        end,
      });
    }
    return;
  }

  if (node.tagName === "br") {
    result.text += "\n";
    return;
  }

  for (const child of node.children ?? []) walkInline(child, result);
}
