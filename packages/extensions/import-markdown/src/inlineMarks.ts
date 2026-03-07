import type { InlineMark, MdastNode } from "./types.js";

interface InlineContext {
  text: string;
  marks: InlineMark[];
  offset: number;
}

export function processInlineNodes(
  nodes: MdastNode[],
  ctx: InlineContext,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        ctx.text += node.value ?? "";
        ctx.offset += (node.value ?? "").length;
        break;

      case "strong": {
        const start = ctx.offset;
        processInlineNodes(node.children ?? [], ctx);
        ctx.marks.push({ type: "bold", start, end: ctx.offset });
        break;
      }

      case "emphasis": {
        const start = ctx.offset;
        processInlineNodes(node.children ?? [], ctx);
        ctx.marks.push({ type: "italic", start, end: ctx.offset });
        break;
      }

      case "delete": {
        const start = ctx.offset;
        processInlineNodes(node.children ?? [], ctx);
        ctx.marks.push({ type: "strikethrough", start, end: ctx.offset });
        break;
      }

      case "inlineCode":
        ctx.marks.push({
          type: "code",
          start: ctx.offset,
          end: ctx.offset + (node.value ?? "").length,
        });
        ctx.text += node.value ?? "";
        ctx.offset += (node.value ?? "").length;
        break;

      case "link": {
        const start = ctx.offset;
        processInlineNodes(node.children ?? [], ctx);
        ctx.marks.push({
          type: "link",
          props: { href: node.url, title: node.title ?? undefined },
          start,
          end: ctx.offset,
        });
        break;
      }

      case "image":
        ctx.text += node.alt ?? "";
        ctx.offset += (node.alt ?? "").length;
        break;

      case "html": {
        const stripped = stripHTMLTags(node.value ?? "");
        ctx.text += stripped;
        ctx.offset += stripped.length;
        break;
      }

      default:
        if (node.children && Array.isArray(node.children)) {
          processInlineNodes(node.children, ctx);
        } else if (typeof node.value === "string") {
          ctx.text += node.value;
          ctx.offset += node.value.length;
        }
        break;
    }
  }
}

function stripHTMLTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
