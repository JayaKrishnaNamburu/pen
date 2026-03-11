import { parseDocument } from "htmlparser2";
import type { InlineMark } from "./types";

interface InlineContext {
  text: string;
  marks: InlineMark[];
  offset: number;
}

type ParsedHtmlNode = {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: ParsedHtmlNode[];
};

type ParsedHtmlElement = ParsedHtmlNode & {
  name: string;
  attribs?: Record<string, string>;
  children?: ParsedHtmlNode[];
};

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

export function collectInlineHtmlContent(html: string): {
  text: string;
  marks: InlineMark[];
} {
  const doc = parseDocument(html);
  const ctx: InlineContext = { text: "", marks: [], offset: 0 };

  for (const child of doc.children ?? []) {
    walkHtmlNode(child, ctx);
  }

  return { text: ctx.text, marks: ctx.marks };
}

function walkHtmlNode(node: ParsedHtmlNode, ctx: InlineContext): void {
  if (node.type === "text") {
    const text = "data" in node ? String(node.data) : "";
    ctx.text += text;
    ctx.offset += text.length;
    return;
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return;
  }

  if (node.type === "tag" || node.type === "script" || node.type === "style") {
    const el = node as ParsedHtmlElement;
    const markType = INLINE_MARK_MAP[el.name];
    if (markType) {
      const start = ctx.offset;
      for (const child of el.children ?? []) {
        walkHtmlNode(child, ctx);
      }
      ctx.marks.push({ type: markType, start, end: ctx.offset });
      return;
    }

    if (el.name === "a") {
      const start = ctx.offset;
      for (const child of el.children ?? []) {
        walkHtmlNode(child, ctx);
      }
      ctx.marks.push({
        type: "link",
        props: {
          href: el.attribs?.href ?? "",
          title: el.attribs?.title ?? undefined,
        },
        start,
        end: ctx.offset,
      });
      return;
    }

    if (el.name === "span") {
      const style = el.attribs?.style ?? "";
      const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
      const bgMatch = style.match(
        /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i,
      );
      const start = ctx.offset;
      for (const child of el.children ?? []) {
        walkHtmlNode(child, ctx);
      }
      const end = ctx.offset;

      if (colorMatch) {
        ctx.marks.push({
          type: "textColor",
          props: { color: colorMatch[1].trim() },
          start,
          end,
        });
      }
      if (bgMatch) {
        ctx.marks.push({
          type: "backgroundColor",
          props: { color: bgMatch[1].trim() },
          start,
          end,
        });
      }
      return;
    }

    if (el.name === "br") {
      ctx.text += "\n";
      ctx.offset += 1;
      return;
    }
  }

  for (const child of node.children ?? []) {
    walkHtmlNode(child, ctx);
  }
}
