import type { ImportResult, Editor } from "@input/pen-types";
import type { PendingBlock } from "@input/pen-core";

/**
 * Ingest envelope (IOP5 / SEC4). Same numbers as the markdown and
 * json importers in this package — not per-format values. Each format
 * keeps a local copy because the shared-constant extract is out of
 * this step's fence; the numbers must stay identical so one document
 * arriving by two routes has one limit.
 *
 * Documented here and in the package README alongside
 * `spec/rules/scale.md` SCALE1 (verified document size) so a host
 * can tell paste/import caps from the published runtime envelope.
 *
 * SEC4: depth 32, 10k nodes. IOP5 adds total text size and image count.
 * Exceeding a cap truncates at a block boundary (`import-truncated`).
 */

/** Maximum block-tree depth, including the top-level block. List `indent` uses the same cap (0-based). */
export const INGEST_MAX_NESTING_DEPTH = 32;

/** Maximum nodes (blocks, including table rows/cells) accepted in one ingest. */
export const INGEST_MAX_NODE_COUNT = 10_000;

/**
 * Maximum imported plain text, in UTF-16 code units. Also the pre-parse cap
 * on the raw HTML source so a pathological 40MB file degrades instead of
 * hanging the tab.
 */
export const INGEST_MAX_TEXT_SIZE = 1_048_576;

/** Maximum image blocks accepted in one ingest. */
export const INGEST_MAX_IMAGE_COUNT = 256;

/**
 * Advisory IOP5 wall-clock ceiling for one HTML ingest, including HTML
 * paste (`htmlImporter.parse` / `import`). Same number as
 * `CLIPBOARD_INGEST_TIME_BUDGET_MS`.
 *
 * Not a unit-suite gate — the suite pins the cardinality caps and the
 * cap-before-parse ordering, which is why a pathological paste finishes.
 * `capRawHtmlSource` slices to `INGEST_MAX_TEXT_SIZE` before parse, so
 * a 40MB paste is O(cap) work, not O(input). The parse step refuses a
 * longer source. Record timing in `@input/pen-bench` if the clock
 * itself needs a home.
 */
export const INGEST_TIME_BUDGET_MS = 1_000;

export const INGEST_FORBIDDEN_KEYS = [
  "__proto__",
  "constructor",
  "prototype",
] as const;

export type IngestDropReason =
  | "unknown-block-type"
  | "profile-disallowed"
  | "depth-exceeded"
  | "count-exceeded"
  | "text-size-exceeded"
  | "image-count-exceeded"
  | "invalid-props"
  | "forbidden-key";

const BOUND_BY_REASON: Partial<Record<IngestDropReason, string>> = {
  "depth-exceeded": "INGEST_MAX_NESTING_DEPTH",
  "count-exceeded": "INGEST_MAX_NODE_COUNT",
  "text-size-exceeded": "INGEST_MAX_TEXT_SIZE",
  "image-count-exceeded": "INGEST_MAX_IMAGE_COUNT",
};

const LIMIT_BY_REASON: Partial<Record<IngestDropReason, number>> = {
  "depth-exceeded": INGEST_MAX_NESTING_DEPTH,
  "count-exceeded": INGEST_MAX_NODE_COUNT,
  "text-size-exceeded": INGEST_MAX_TEXT_SIZE,
  "image-count-exceeded": INGEST_MAX_IMAGE_COUNT,
};

export interface IngestDroppedByReason {
  readonly reason: IngestDropReason;
  readonly count: number;
  readonly bound?: string;
  readonly limit?: number;
  readonly actual?: number;
  readonly dropped: string;
}

export interface IngestReport extends ImportResult {
  readonly droppedByReason: readonly IngestDroppedByReason[];
}

export class IngestDropCounts {
  private readonly counts = new Map<IngestDropReason, number>();
  private readonly actuals = new Map<IngestDropReason, number>();

  add(reason: IngestDropReason, count = 1, actual?: number): void {
    this.counts.set(reason, (this.counts.get(reason) ?? 0) + count);
    if (actual !== undefined) {
      this.actuals.set(reason, Math.max(this.actuals.get(reason) ?? 0, actual));
    }
  }

  toDroppedByReason(): IngestDroppedByReason[] {
    const reasons = [...this.counts.entries()].sort(([a], [b]) =>
      a.localeCompare(b, "en"),
    );
    return reasons.map(([reason, count]) => {
      const bound = BOUND_BY_REASON[reason];
      const limit = LIMIT_BY_REASON[reason];
      const actual = resolveActual(reason, count, this.actuals.get(reason));
      const entry: IngestDroppedByReason = {
        reason,
        count,
        dropped: formatDropped(reason, count),
      };
      if (bound && limit !== undefined && actual !== undefined) {
        return { ...entry, bound, limit, actual };
      }
      return bound ? { ...entry, bound } : entry;
    });
  }
}

export function createIngestReport(
  parsedTopLevelBlockCount: number,
  importedTopLevelBlockCount: number,
  droppedBlockTypes: readonly string[],
  drops: IngestDropCounts,
): IngestReport {
  const droppedByReason = drops.toDroppedByReason();
  return {
    parsedTopLevelBlockCount,
    importedTopLevelBlockCount,
    droppedBlockCount: Math.max(
      0,
      parsedTopLevelBlockCount - importedTopLevelBlockCount,
    ),
    droppedBlockTypes: [...droppedBlockTypes],
    normalized: droppedByReason.length > 0,
    droppedByReason,
  };
}

export function capRawHtmlSource(
  input: string,
  drops: IngestDropCounts,
): string {
  if (input.length <= INGEST_MAX_TEXT_SIZE) {
    return input;
  }

  const slice = input.slice(0, INGEST_MAX_TEXT_SIZE);
  const lastNewline = slice.lastIndexOf("\n");
  const truncated = lastNewline > 0 ? slice.slice(0, lastNewline) : slice;
  drops.add("text-size-exceeded", input.length - truncated.length, input.length);
  return truncated;
}

export function boundPendingBlocks(
  blocks: readonly PendingBlock[],
  drops: IngestDropCounts,
  depth = 1,
  state: { nodes: number; text: number; images: number } = {
    nodes: 0,
    text: 0,
    images: 0,
  },
): PendingBlock[] {
  const kept: PendingBlock[] = [];

  for (const block of blocks) {
    const indent =
      typeof block.props.indent === "number" ? block.props.indent : 0;
    if (depth > INGEST_MAX_NESTING_DEPTH || indent >= INGEST_MAX_NESTING_DEPTH) {
      drops.add(
        "depth-exceeded",
        countNodes(block),
        Math.max(depth, indent + 1),
      );
      continue;
    }

    if (state.nodes >= INGEST_MAX_NODE_COUNT) {
      drops.add("count-exceeded", countNodes(block));
      continue;
    }

    if (block.type === "image" && state.images >= INGEST_MAX_IMAGE_COUNT) {
      drops.add("image-count-exceeded");
      continue;
    }

    const textLen = textSizeOf(block);
    if (state.text + textLen > INGEST_MAX_TEXT_SIZE) {
      drops.add("text-size-exceeded", textLen, state.text + textLen);
      continue;
    }

    state.nodes += 1;
    state.text += textLen;
    if (block.type === "image") {
      state.images += 1;
    }

    const next: PendingBlock = {
      ...block,
      props: { ...block.props },
    };
    if (block.children) {
      next.children = boundPendingBlocks(
        block.children,
        drops,
        depth + 1,
        state,
      );
    }
    kept.push(next);
  }

  return kept;
}

export function emitIngestReport(
  editor: Pick<Editor, "internals">,
  report: IngestReport,
  source: string,
): void {
  if (report.droppedByReason.length === 0) {
    return;
  }

  const truncated = report.droppedByReason.some((entry) => entry.bound);
  editor.internals.emit("diagnostic", {
    code: truncated ? "import-truncated" : "import-dropped",
    level: "warn",
    source,
    message: formatIngestMessage(report, truncated),
    droppedByReason: report.droppedByReason,
  });
}

function formatIngestMessage(report: IngestReport, truncated: boolean): string {
  const parts = report.droppedByReason.map((entry) => {
    const bound = entry.bound ? ` (${entry.bound})` : "";
    const measured =
      entry.actual !== undefined && entry.limit !== undefined
        ? ` actual ${entry.actual} limit ${entry.limit}`
        : "";
    return `${entry.dropped} ${entry.reason}${bound}${measured}`;
  });
  const verb = truncated ? "truncated" : "dropped";
  return `import ${verb}: ${parts.join("; ")}`;
}

function resolveActual(
  reason: IngestDropReason,
  count: number,
  stored: number | undefined,
): number | undefined {
  if (stored !== undefined) {
    return stored;
  }
  if (reason === "count-exceeded") {
    return INGEST_MAX_NODE_COUNT + count;
  }
  if (reason === "image-count-exceeded") {
    return INGEST_MAX_IMAGE_COUNT + count;
  }
  return undefined;
}

function formatDropped(reason: IngestDropReason, count: number): string {
  switch (reason) {
    case "text-size-exceeded":
      return `${count} code unit${count === 1 ? "" : "s"}`;
    case "image-count-exceeded":
      return `${count} image${count === 1 ? "" : "s"}`;
    case "forbidden-key":
      return `${count} own key${count === 1 ? "" : "s"}`;
    case "invalid-props":
      return `${count} prop${count === 1 ? "" : "s"}`;
    case "unknown-block-type":
    case "profile-disallowed":
    case "depth-exceeded":
    case "count-exceeded":
      return `${count} block${count === 1 ? "" : "s"}`;
    default: {
      const exhaustive: never = reason;
      return exhaustive;
    }
  }
}

function countNodes(block: PendingBlock): number {
  let count = 1;
  if (block.children) {
    for (const child of block.children) {
      count += countNodes(child);
    }
  }
  return count;
}

function textSizeOf(block: PendingBlock): number {
  let size = 0;
  if (block.segments && block.segments.length > 0) {
    for (const segment of block.segments) {
      if (segment.type === "text") {
        size += segment.text.length;
      }
    }
  } else if (block.content) {
    size += block.content.length;
  }

  return size;
}
