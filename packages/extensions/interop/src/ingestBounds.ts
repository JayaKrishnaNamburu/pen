/**
 * Ingest envelope (IOP5 / SEC4). One set of numbers for every ingest
 * path, including clipboard (`CLIPBOARD_INGEST_*` in pen-dom must stay
 * identical). Exceeding a cap truncates at a block boundary
 * (`import-truncated`).
 *
 * SEC4: depth 32, 10k nodes. IOP5 adds total text size and image count.
 */

/** Maximum block-tree depth, including the top-level block. List `indent` uses the same cap (0-based). */
export const INGEST_MAX_NESTING_DEPTH = 32;

/** Maximum nodes (blocks, including table rows/cells) accepted in one ingest. */
export const INGEST_MAX_NODE_COUNT = 10_000;

/**
 * Maximum imported plain text, in UTF-16 code units. Also the pre-parse
 * cap on raw HTML/markdown source. JSON/XML refuse an oversize source
 * before parse instead of slicing.
 */
export const INGEST_MAX_TEXT_SIZE = 1_048_576;

/** Maximum image blocks accepted in one ingest. */
export const INGEST_MAX_IMAGE_COUNT = 256;

/**
 * Advisory IOP5 wall-clock ceiling. Same number as
 * `CLIPBOARD_INGEST_TIME_BUDGET_MS`. Not a unit-suite gate — the suite
 * pins the cardinality caps and the cap-before-parse ordering.
 */
export const INGEST_TIME_BUDGET_MS = 1_000;

export const INGEST_FORBIDDEN_KEYS = [
	"__proto__",
	"constructor",
	"prototype",
] as const;
