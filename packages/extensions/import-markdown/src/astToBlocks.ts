import type {
  PendingBlock,
  InlineMark,
  MdastNode,
  MdastRoot,
  MdastList,
  MdastListItem,
} from "./types.js";
import { processInlineNodes } from "./inlineMarks.js";
import { parseTable } from "./tableParser.js";
import type { SchemaRegistry } from "@pen/core";

const BLOCK_MAPPINGS: Record<
  string,
  (node: MdastNode) => PendingBlock | null
> = {
  heading: (node) => ({
    type: "heading",
    props: { level: node.depth ?? 1 },
    content: "",
    marks: [],
  }),

  paragraph: () => ({
    type: "paragraph",
    props: {},
    content: "",
    marks: [],
  }),

  blockquote: () => ({
    type: "blockquote",
    props: {},
    content: "",
    marks: [],
  }),

  code: (node) => ({
    type: "codeBlock",
    props: { language: node.lang ?? undefined },
    content: node.value ?? "",
    marks: [],
  }),

  thematicBreak: () => ({
    type: "divider",
    props: {},
  }),

  image: (node) => ({
    type: "image",
    props: {
      src: node.url ?? "",
      alt: node.alt ?? undefined,
      caption: node.title ?? undefined,
    },
  }),

  table: (node) => parseTable(node as any),
};

export function astToBlocks(
  root: MdastRoot,
  registry: SchemaRegistry,
): PendingBlock[] {
  const blocks: PendingBlock[] = [];
  walkNodes(root.children, blocks, registry, 0);
  return blocks;
}

function walkNodes(
  nodes: MdastNode[],
  blocks: PendingBlock[],
  registry: SchemaRegistry,
  listIndent: number,
): void {
  for (const node of nodes) {
    if (
      node.type === "paragraph" &&
      node.children?.length === 1 &&
      node.children[0].type === "image"
    ) {
      const imgNode = node.children[0];
      blocks.push({
        type: "image",
        props: {
          src: imgNode.url ?? "",
          alt: imgNode.alt ?? undefined,
          caption: imgNode.title ?? undefined,
        },
      });
      continue;
    }

    const schemaBlock = resolveFromSchema(node, registry);
    if (schemaBlock) {
      blocks.push(schemaBlock);
      continue;
    }

    const mapping = BLOCK_MAPPINGS[node.type];
    if (mapping) {
      const block = mapping(node);
      if (!block) continue;

      if (
        node.children &&
        block.type !== "codeBlock" &&
        block.type !== "table"
      ) {
        const ctx = { text: "", marks: [] as InlineMark[], offset: 0 };
        processInlineNodes(node.children, ctx);
        block.content = ctx.text;
        block.marks = ctx.marks;
      }

      blocks.push(block);
      continue;
    }

    if (node.type === "list") {
      walkListItems(node as MdastList, blocks, registry, listIndent);
      continue;
    }

    if (node.type === "listItem") {
      const block = listItemToBlock(node as MdastListItem, listIndent);
      blocks.push(block);

      if (node.children) {
        for (const child of node.children) {
          if (child.type === "list") {
            walkListItems(
              child as MdastList,
              blocks,
              registry,
              listIndent + 1,
            );
          }
        }
      }
      continue;
    }

    if (node.children && Array.isArray(node.children)) {
      walkNodes(node.children, blocks, registry, listIndent);
    }
  }
}

function walkListItems(
  listNode: MdastList,
  blocks: PendingBlock[],
  registry: SchemaRegistry,
  indent: number,
): void {
  for (let i = 0; i < listNode.children.length; i++) {
    const item = listNode.children[i];
    const block = listItemToBlock(item, indent, listNode, i);
    blocks.push(block);

    for (const child of item.children ?? []) {
      if (child.type === "list") {
        walkListItems(child as MdastList, blocks, registry, indent + 1);
      }
    }
  }
}

function listItemToBlock(
  item: MdastListItem,
  indent: number,
  list?: MdastList,
  index?: number,
): PendingBlock {
  if (item.checked !== undefined && item.checked !== null) {
    const ctx = { text: "", marks: [] as InlineMark[], offset: 0 };
    const inlineChildren = (item.children ?? []).filter(
      (c) => c.type !== "list",
    );
    for (const child of inlineChildren) {
      if (child.children) {
        processInlineNodes(child.children, ctx);
      }
    }
    return {
      type: "checkListItem",
      props: { indent, checked: item.checked },
      content: ctx.text,
      marks: ctx.marks,
    };
  }

  if (list?.ordered) {
    const ctx = { text: "", marks: [] as InlineMark[], offset: 0 };
    const inlineChildren = (item.children ?? []).filter(
      (c) => c.type !== "list",
    );
    for (const child of inlineChildren) {
      if (child.children) {
        processInlineNodes(child.children, ctx);
      }
    }
    return {
      type: "numberedListItem",
      props: {
        indent,
        start: index === 0 ? (list.start ?? 1) : undefined,
      },
      content: ctx.text,
      marks: ctx.marks,
    };
  }

  const ctx = { text: "", marks: [] as InlineMark[], offset: 0 };
  const inlineChildren = (item.children ?? []).filter(
    (c) => c.type !== "list",
  );
  for (const child of inlineChildren) {
    if (child.children) {
      processInlineNodes(child.children, ctx);
    }
  }
  return {
    type: "bulletListItem",
    props: { indent },
    content: ctx.text,
    marks: ctx.marks,
  };
}

function resolveFromSchema(
  node: MdastNode,
  registry: SchemaRegistry,
): PendingBlock | null {
  if (!registry.resolve) return null;
  const blockSchemas = registry.allBlocks?.() ?? [];
  for (const schema of blockSchemas) {
    if (schema.serialize?.fromMarkdown) {
      const result = schema.serialize.fromMarkdown(node as any);
      if (result) return result as PendingBlock;
    }
  }
  return null;
}
