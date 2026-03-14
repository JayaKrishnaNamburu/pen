import type { Editor, Position } from "@pen/types";
import { blocksToOps, type PendingBlock } from "./blocks";
import {
  normalizePendingBlocksForImport,
  reportPendingBlockImportViolations,
} from "./profilePolicy";
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

  return {
    format,
    blocks: normalized.blocks,
    ops: blocksToOps(normalized.blocks, { position: options.position }),
  };
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

  return {
    format: "blocks",
    blocks: normalized.blocks,
    ops: blocksToOps(normalized.blocks, { position: options.position }),
  };
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
