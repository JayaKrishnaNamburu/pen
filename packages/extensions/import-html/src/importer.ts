import type {
  PendingBlock,
} from "@input/pen-core";
import type {
  Editor,
  Importer,
} from "@input/pen-types";
import {
  applyHtmlImageSrcPolicy,
  DEFAULT_HTML_IMAGE_SRC_POLICY,
  type HtmlImportOptions,
} from "./imageSrcPolicy";
import {
  blocksToOps,
  normalizePendingBlocksForImport,
} from "@input/pen-core";
import {
  boundPendingBlocks,
  capRawHtmlSource,
  createIngestReport,
  emitIngestReport,
  IngestDropCounts,
  type IngestReport,
} from "./ingestBounds";
import { sanitizeHTML } from "./sanitize";
import { parseHTML } from "./domAdapter";
import { domToBlocks } from "./domToBlocks";

function parseRawHtmlToBlocks(
  input: string,
  editor: Editor,
): PendingBlock[] {
  const sanitized = sanitizeHTML(input);
  const dom = parseHTML(sanitized);
  return domToBlocks(dom, editor.schema);
}

export function parseHtmlWithReport(
  input: string,
  editor: Editor,
): {
  blocks: PendingBlock[];
  report: IngestReport;
} {
  const drops = new IngestDropCounts();
  const source = capRawHtmlSource(input, drops);
  const parsedBlocks = parseRawHtmlToBlocks(source, editor);
  const bounded = boundPendingBlocks(parsedBlocks, drops);
  return {
    blocks: bounded,
    report: createIngestReport(
      parsedBlocks.length,
      bounded.length,
      [],
      drops,
    ),
  };
}

function normalizeHtmlToBlocks(
  input: string,
  editor: Editor,
): {
  blocks: PendingBlock[];
  result: IngestReport;
} {
  const drops = new IngestDropCounts();
  const source = capRawHtmlSource(input, drops);
  const parsedBlocks = parseRawHtmlToBlocks(source, editor);
  const bounded = boundPendingBlocks(parsedBlocks, drops);
  const normalized = normalizePendingBlocksForImport(
    bounded,
    editor.documentProfile,
    editor.schema,
  );

  for (const violation of normalized.violations) {
    switch (violation.reason) {
      case "unknown-block-type":
        drops.add("unknown-block-type");
        break;
      case "flow-disallowed-block":
        drops.add("profile-disallowed");
        break;
      default: {
        const exhaustive: never = violation.reason;
        throw new Error(exhaustive);
      }
    }
  }

  const droppedBlockTypes = [
    ...new Set(normalized.violations.map((violation) => violation.blockType)),
  ];
  const result = createIngestReport(
    parsedBlocks.length,
    normalized.blocks.length,
    droppedBlockTypes,
    drops,
  );
  emitIngestReport(editor, result, "import-html");

  return {
    blocks: normalized.blocks,
    result,
  };
}

export function parseHtmlToBlocks(
  input: string,
  editor: Editor,
): PendingBlock[] {
  return parseHtmlWithReport(input, editor).blocks;
}

export interface HtmlImporter extends Importer<string, PendingBlock[]> {
  import(
    input: string,
    editor: Editor,
    options?: HtmlImportOptions,
  ): Promise<IngestReport>;
}

export const htmlImporter: HtmlImporter = {
  name: "html",
  mimeType: "text/html",
  parse(input: string, editor: Editor): PendingBlock[] {
    return parseHtmlToBlocks(input, editor);
  },

  async import(
    input: string,
    editor: Editor,
    options?: HtmlImportOptions,
  ): Promise<IngestReport> {
    const { blocks, result } = normalizeHtmlToBlocks(input, editor);
    const imageSrc = options?.imageSrc ?? DEFAULT_HTML_IMAGE_SRC_POLICY;
    const resolvedBlocks = await applyHtmlImageSrcPolicy(
      blocks,
      editor,
      imageSrc,
    );
    if (resolvedBlocks.length === 0) return result;

    const ops = blocksToOps(resolvedBlocks, options);
    editor.apply(ops, {
      origin: "import",
      ...(options?.undoGroup === false ? {} : { undoGroup: true }),
    });
    return result;
  },
};
