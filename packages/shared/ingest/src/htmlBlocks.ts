import { parseDocument } from "htmlparser2";
import { collectInlineHtmlContent } from "./htmlInline";
import type { PendingBlock } from "./markdownTypes";

type ParsedHtmlNode = {
  type: string;
  data?: string;
  name?: string;
  attribs?: Record<string, string>;
  children?: ParsedHtmlNode[];
};

/**
 * Convert a leftover HTML fragment (the siblings after `<summary>` inside a
 * compact `<details>` block) into pending blocks. Unknown wrappers unwrap.
 */
export function pendingBlocksFromHtmlFragment(html: string): PendingBlock[] {
  const doc = parseDocument(html);
  const blocks: PendingBlock[] = [];
  for (const child of doc.children ?? []) {
    appendHtmlNodeAsBlocks(child as ParsedHtmlNode, blocks);
  }
  return blocks;
}

function appendHtmlNodeAsBlocks(
  node: ParsedHtmlNode,
  blocks: PendingBlock[],
): void {
  if (node.type === "text") {
    const text = (node.data ?? "").trim();
    if (text) {
      blocks.push({ type: "paragraph", props: {}, content: text });
    }
    return;
  }

  if (node.type !== "tag" || !node.name) {
    for (const child of node.children ?? []) {
      appendHtmlNodeAsBlocks(child, blocks);
    }
    return;
  }

  if (node.name === "p") {
    const inline = collectInlineHtmlContent(serializeChildren(node));
    blocks.push({
      type: "paragraph",
      props: {},
      content: inline.text,
      marks: inline.marks,
    });
    return;
  }

  if (/^h[1-6]$/.test(node.name)) {
    const inline = collectInlineHtmlContent(serializeChildren(node));
    blocks.push({
      type: "heading",
      props: { level: Number(node.name[1]) },
      content: inline.text,
      marks: inline.marks,
    });
    return;
  }

  for (const child of node.children ?? []) {
    appendHtmlNodeAsBlocks(child, blocks);
  }
}

function serializeChildren(node: ParsedHtmlNode): string {
  return (node.children ?? []).map(serializeHtmlNode).join("");
}

function serializeHtmlNode(node: ParsedHtmlNode): string {
  if (node.type === "text") {
    return node.data ?? "";
  }
  if (node.type !== "tag" || !node.name) {
    return (node.children ?? []).map(serializeHtmlNode).join("");
  }
  const inner = serializeChildren(node);
  const attrs = serializeAttribs(node.attribs);
  if (node.name === "br") {
    return `<br${attrs}>`;
  }
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

function serializeAttribs(attribs: Record<string, string> | undefined): string {
  if (!attribs) {
    return "";
  }
  let result = "";
  for (const [name, value] of Object.entries(attribs)) {
    result += ` ${name}="${value.replace(/"/g, "&quot;")}"`;
  }
  return result;
}
