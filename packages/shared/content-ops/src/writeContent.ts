import {
  blocksToOps,
  normalizePendingBlocksForImport,
  reportPendingBlockImportViolations,
  shouldExposeBlockInTooling,
  type PendingBlock,
} from "@input/pen-core";
import type { Editor, Position } from "@input/pen-types";
import { parseMarkdownToBlocks } from "./markdown";

type ContentWriteEditor = {
  documentProfile: Editor["documentProfile"];
  schema: Editor["schema"];
  internals: {
    emit: Editor["internals"]["emit"];
  };
};

export type DocumentWriteFormat = "text" | "markdown" | "blocks";

export interface DocumentWriteBlockInput {
  blockType: string;
  content?: string;
  props?: Record<string, unknown>;
}

export interface BuildDocumentWriteOpsOptions {
  format?: DocumentWriteFormat;
  content?: string;
  blocks?: readonly DocumentWriteBlockInput[];
  position?: Position;
  surface?: string;
}

export interface BuildDocumentWriteOpsResult {
  format: DocumentWriteFormat;
  blocks: PendingBlock[];
  ops: ReturnType<typeof blocksToOps>;
}

export function buildDocumentWriteOps(
  editor: ContentWriteEditor,
  options: BuildDocumentWriteOpsOptions,
): BuildDocumentWriteOpsResult {
  const format = resolveDocumentWriteFormat(options);

  if (format === "blocks") {
    return buildBlockWriteOps(editor, options);
  }

  const content = options.content ?? "";
  if (content.length === 0) {
    return {
      format,
      blocks: [],
      ops: [],
    };
  }

  const parsedBlocks =
    format === "markdown"
      ? parseMarkdownToBlocks(content, editor)
      : [{
          type: "paragraph",
          props: {},
          content,
        } satisfies PendingBlock];

  if (hasUnexposedToolBlock(editor, parsedBlocks)) {
    return {
      format,
      blocks: [],
      ops: [],
    };
  }

  const normalized = normalizePendingBlocksForImport(
    parsedBlocks,
    editor.documentProfile,
    editor.schema,
  );
  reportPendingBlockImportViolations(
    editor,
    normalized.violations,
    options.surface ?? `write-content:${format}`,
  );

  return finishDocumentWriteOps(editor, format, normalized.blocks, options.position);
}

function buildBlockWriteOps(
  editor: ContentWriteEditor,
  options: BuildDocumentWriteOpsOptions,
): BuildDocumentWriteOpsResult {
  const pendingBlocks = (options.blocks ?? []).map((block) => ({
    type: block.blockType,
    props: block.props ?? {},
    ...(typeof block.content === "string" ? { content: block.content } : {}),
  })) satisfies PendingBlock[];

  if (hasUnexposedToolBlock(editor, pendingBlocks)) {
    return {
      format: "blocks",
      blocks: [],
      ops: [],
    };
  }

  const normalized = normalizePendingBlocksForImport(
    pendingBlocks,
    editor.documentProfile,
    editor.schema,
  );
  reportPendingBlockImportViolations(
    editor,
    normalized.violations,
    options.surface ?? "write-content:blocks",
  );

  return finishDocumentWriteOps(
    editor,
    "blocks",
    normalized.blocks,
    options.position,
  );
}

function finishDocumentWriteOps(
  editor: ContentWriteEditor,
  format: DocumentWriteFormat,
  blocks: PendingBlock[],
  position: Position | undefined,
): BuildDocumentWriteOpsResult {
  if (hasUnexposedToolBlock(editor, blocks)) {
    return {
      format,
      blocks: [],
      ops: [],
    };
  }

  return {
    format,
    blocks,
    ops: blocksToOps(blocks, { position }),
  };
}

function hasUnexposedToolBlock(
  editor: ContentWriteEditor,
  blocks: readonly PendingBlock[],
): boolean {
  let rejected = false;
  for (const block of blocks) {
    if (block.type.startsWith("__")) {
      if (block.children && hasUnexposedToolBlock(editor, block.children)) {
        rejected = true;
      }
      continue;
    }

    const schema = editor.schema.resolve(block.type);
    if (!schema || !shouldExposeBlockInTooling(editor.documentProfile, schema)) {
      editor.internals.emit("diagnostic", {
        code: "content-ops-unexposed-block",
        level: "error",
        source: "content-ops",
        message: `Block type "${block.type}" is not available in ${editor.documentProfile} documents.`,
        payload: { blockType: block.type },
      });
      rejected = true;
      continue;
    }

    if (block.children && hasUnexposedToolBlock(editor, block.children)) {
      rejected = true;
    }
  }
  return rejected;
}

function resolveDocumentWriteFormat(
  options: BuildDocumentWriteOpsOptions,
): DocumentWriteFormat {
  if (options.format) {
    return options.format;
  }

  if ((options.blocks?.length ?? 0) > 0) {
    return "blocks";
  }

  return "text";
}
