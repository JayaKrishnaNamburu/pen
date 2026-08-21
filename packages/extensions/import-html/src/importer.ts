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
  INGEST_MAX_TEXT_SIZE,
  IngestDropCounts,
  type IngestReport,
} from "./ingestBounds";
import { sanitizeHTML } from "./sanitize";
import { parseHTML } from "./domAdapter";
import { domToBlocks } from "./domToBlocks";

function parseHtmlSource(source: string, editor: Editor): PendingBlock[] {
  if (source.length > INGEST_MAX_TEXT_SIZE) {
    throw new Error(
      `HTML parse received ${source.length} code units; INGEST_MAX_TEXT_SIZE is ${INGEST_MAX_TEXT_SIZE}`,
    );
  }
  const sanitized = sanitizeHTML(source);
  const dom = parseHTML(sanitized);
  return domToBlocks(dom, editor.schema);
}

function parseCappedHtmlToBlocks(
  input: string,
  editor: Editor,
  drops: IngestDropCounts,
): PendingBlock[] {
  return parseHtmlSource(capRawHtmlSource(input, drops), editor);
}

export function parseHtmlWithReport(
  input: string,
  editor: Editor,
): {
  blocks: PendingBlock[];
  report: IngestReport;
} {
  const drops = new IngestDropCounts();
  const parsedBlocks = parseCappedHtmlToBlocks(input, editor, drops);
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
  const parsedBlocks = parseCappedHtmlToBlocks(input, editor, drops);
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
    const { blocks, report } = parseHtmlWithReport(input, editor);
    emitIngestReport(editor, report, "import-html");
    return blocks;
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
