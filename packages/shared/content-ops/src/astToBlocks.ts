import type { BlockImportMatch, MarkdownNode, SchemaRegistry } from "@pen/types";
import { collectInlineHtmlContent } from "./htmlInline";
import { collectInlineContent, processInlineNodes } from "./inlineMarks";
import {
  parseDatabaseMarkdownMarker,
  parseTable,
} from "./tableParser";
import type {
  InlineMark,
  MdastList,
  MdastListItem,
  MdastNode,
  MdastRoot,
  MdastTable,
  PendingBlock,
} from "./markdownTypes";

const blockMappings: Record<
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

  table: (node) => parseTable(node as MdastTable),
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
  let pendingDatabasePayload: ReturnType<typeof parseDatabaseMarkdownMarker> =
    null;

  for (const node of nodes) {
    if (node.type === "html") {
      const payload = parseDatabaseMarkdownMarker(node.value);
      if (payload) {
        pendingDatabasePayload = payload;
        continue;
      }
    }

    if (
      node.type === "paragraph" &&
      node.children?.length === 1 &&
      node.children[0]?.type === "image"
    ) {
      const imageNode = node.children[0];
      blocks.push({
        type: "image",
        props: {
          src: imageNode.url ?? "",
          alt: imageNode.alt ?? undefined,
          caption: imageNode.title ?? undefined,
        },
      });
      continue;
    }

    const schemaBlock = resolveFromSchema(node, registry);
    if (schemaBlock) {
      const inlineSourceHtml = getMarkdownInlineHtml(schemaBlock);
      if (inlineSourceHtml !== null) {
        const inline = collectInlineHtmlContent(inlineSourceHtml);
        schemaBlock.content = inline.text;
        schemaBlock.marks = inline.marks;
      } else {
        const inlineSourceNodes = getMarkdownInlineSource(schemaBlock, node);
        if (!inlineSourceNodes) {
          blocks.push(schemaBlock);
          continue;
        }
        const inline = collectInlineContent(inlineSourceNodes);
        schemaBlock.content = inline.text;
        schemaBlock.marks = inline.marks;
      }
      blocks.push(schemaBlock);
      continue;
    }

    const mapping = blockMappings[node.type];
    if (mapping) {
      const block =
        node.type === "table"
          ? parseTable(node as MdastTable, pendingDatabasePayload)
          : mapping(node);
      if (!block) {
        continue;
      }
      pendingDatabasePayload = null;

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
      pendingDatabasePayload = null;
      walkListItems(node as MdastList, blocks, registry, listIndent);
      continue;
    }

    if (node.type === "listItem") {
      pendingDatabasePayload = null;
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
      pendingDatabasePayload = null;
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
  for (let index = 0; index < listNode.children.length; index += 1) {
    const item = listNode.children[index]!;
    const block = listItemToBlock(item, indent, listNode, index);
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
      (child) => child.type !== "list",
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
      (child) => child.type !== "list",
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
    (child) => child.type !== "list",
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
): BlockImportMatch | null {
  const blockSchemas = registry.allBlocks?.() ?? [];
  for (const schema of blockSchemas) {
    const serializer = schema.serialize?.fromMarkdown;
    if (!serializer) {
      continue;
    }

    const result = serializer(node as MarkdownNode);
    if (result) {
      return result;
    }
  }

  return null;
}

function getMarkdownInlineSource(
  block: BlockImportMatch,
  node: MdastNode,
): MdastNode[] | null {
  if (block.type === "codeBlock" || block.type === "table") {
    return null;
  }

  if (block.importContentSource?.markdownNodes) {
    return block.importContentSource.markdownNodes as MdastNode[];
  }

  if (block.content === undefined && node.children) {
    return node.children;
  }

  return null;
}

function getMarkdownInlineHtml(block: BlockImportMatch): string | null {
  return block.importContentSource?.markdownHtml ?? null;
}
