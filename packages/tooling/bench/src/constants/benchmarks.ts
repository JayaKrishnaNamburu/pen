import type { BenchDefinition } from "../bench";
import { getScale3Baseline } from "./scale3";

// id is optional on BenchDefinition (a bench can run unregistered) but REQUIRED here:
// the registry is keyed by id and the population parity check compares registered ids
// against running ids, so a metadata entry without one cannot participate in it at all.
type BenchMetadata = Pick<BenchDefinition, "name" | "targetMs" | "critical"> & {
	id: string;
};

export const CRDT_INSERT_1000_BLOCKS_BENCH: BenchMetadata = {
	id: "crdt.insert-1000-blocks",
	name: "insert 1000 blocks sequentially",
	targetMs: 500,
};

export const CRDT_ENCODE_STATE_500_BENCH: BenchMetadata = {
	id: "crdt.encode-state-500",
	name: "encodeState 500-block document",
	targetMs: 50,
};

export const CRDT_LOAD_DOCUMENT_500_BENCH: BenchMetadata = {
	id: "crdt.load-document-500",
	name: "loadDocument 500-block document",
	targetMs: 100,
};

export const CRDT_FORK_MERGE_100_BENCH: BenchMetadata = {
	id: "crdt.fork-merge-100",
	name: "fork + merge 100-block document",
};

export const ANCHORS_ENCODE_SIZE_1000_BENCH: BenchMetadata = {
	id: "anchors.encode-size-1000",
	name: "Yjs relative-position encode size x1000",
};

export const ANCHORS_RESOLVE_70K_1000_BENCH: BenchMetadata = {
	id: "anchors.resolve-70k-1000",
	name: "Yjs relative-position resolve 70k chars x1000",
};

export const ANCHORS_RESOLVE_200_BLOCKS_BENCH: BenchMetadata = {
	id: "anchors.resolve-200-blocks",
	name: "Yjs relative-position resolve across 200 blocks",
};

export const ANCHORS_SPLIT_FOLLOW_BENCH: BenchMetadata = {
	id: "anchors.split-follow",
	name: "Yjs relative-position follow after Pen copy-split",
};

// The four above address a paragraph's `block.content`. A table cell's text is a
// nested Y.Text at `tableContent[row].cells[col].content` and a table block has no
// `content` key at all, so these are a different substrate rather than a size
// variant. There is no cell equivalent of `anchors.split-follow`:
// `split-table-cell` is a validated no-op, so a cell never undergoes copy-split.
export const ANCHORS_ENCODE_SIZE_CELL_1000_BENCH: BenchMetadata = {
	id: "anchors.encode-size-cell-1000",
	name: "Yjs relative-position encode size in a table cell x1000",
};

export const ANCHORS_RESOLVE_CELL_70K_1000_BENCH: BenchMetadata = {
	id: "anchors.resolve-cell-70k-1000",
	name: "Yjs relative-position resolve 70k chars in a table cell x1000",
};

export const ANCHORS_RESOLVE_200_CELLS_BENCH: BenchMetadata = {
	id: "anchors.resolve-200-cells",
	name: "Yjs relative-position resolve across 200 table cells",
};

export const ANCHORS_CELL_IN_BLOCK_EDIT_BENCH: BenchMetadata = {
	id: "anchors.cell-in-block-edit",
	name: "Yjs relative-position shift and collapse within a table cell",
};

export const SCHEMA_RESOLVE_X10000_BENCH: BenchMetadata = {
	id: "schema.resolve-x10000",
	name: "schema resolve x10000",
	targetMs: 10,
};

// Re-baselined 200 -> 500 under CH8, which asks that a budget the CI runner
// cannot meet reliably be re-recorded with the number written down rather than
// left permanently red. Measurements behind the move: 49.86ms idle on an
// Apple Silicon laptop, and on ubuntu-latest 117.78ms on one run against
// 272.25ms and 277.69ms on two others — a 2.4x spread across the same commit
// range, which straddled the old target and made the gate report the runner
// rather than the diff. This is the heaviest bench in the set and the only one
// that moved; the 1ms and 10ms critical targets stay green on the same runner.
// 500 clears the worst observed run by ~1.8x and still fails a 2x regression.
export const SCHEMA_NORMALIZE_500_BLOCK_DOCUMENT_BENCH: BenchMetadata = {
	id: "schema.normalize-500-block-document",
	name: "normalize 500-block document",
	targetMs: 500,
	critical: true,
};

export const SCHEMA_ALL_BLOCK_DISPLAYS_BENCH: BenchMetadata = {
	id: "schema.all-block-displays",
	name: "allBlockDisplays (slash menu population)",
};

export const STREAMING_GEN_DELTA_1000_PARTS_BENCH: BenchMetadata = {
	id: "streaming.gen-delta-1000-parts",
	name: "streaming 1000 gen-delta parts at 100/sec",
	targetMs: 10,
};

export const STREAMING_BATCH_FLUSH_LATENCY_BENCH: BenchMetadata = {
	id: "streaming.batch-flush-latency",
	name: "streaming batch flush latency",
	targetMs: 10,
	critical: true,
};

export const EXTENSION_DISPATCH_OBSERVE_X5_BENCH: BenchMetadata = {
	id: "extension.dispatch-observe-x5",
	name: "extension dispatchObserve with 5 extensions",
	targetMs: 1,
	critical: true,
};

export const EXTENSION_COLLECT_DECORATIONS_X5_BENCH: BenchMetadata = {
	id: "extension.collect-decorations-x5",
	name: "extension collectDecorations with 5 extensions",
};

export const EDITOR_APPLY_INSERT_TEXT_X1000_BENCH: BenchMetadata = {
	id: "editor.apply-insert-text-x1000",
	name: "editor.apply insert-text x1000",
};

export const EDITOR_APPLY_INSERT_DELETE_BLOCK_X500_BENCH: BenchMetadata = {
	id: "editor.apply-insert-delete-block-x500",
	name: "editor.apply insert-block + delete-block x500",
};

export const AI_READ_DOCUMENT_SUMMARY_200_BLOCKS_BENCH: BenchMetadata = {
	id: "ai.read-document-summary-200-blocks",
	name: "ai read_document summary on 200 blocks",
};

export const AI_GET_CONTEXT_SUMMARY_200_BLOCKS_BENCH: BenchMetadata = {
	id: "ai.get-context-summary-200-blocks",
	name: "ai get_context summary on 200 blocks",
};

export const AI_GET_CURSOR_CONTEXT_BENCH: BenchMetadata = {
	id: "ai.get-cursor-context",
	name: "ai get_cursor_context",
};

export const AI_PROMPT_ASSEMBLY_TOOL_JOURNAL_BENCH: BenchMetadata = {
	id: "ai.prompt-assembly-tool-journal",
	name: "ai prompt assembly from tool journal",
};

export const AI_READ_DOCUMENT_RANGE_20_BLOCKS_BENCH: BenchMetadata = {
	id: "ai.read-document-range-20-blocks",
	name: "ai read_document markdown range on 20 blocks",
};

export const AI_RETRIEVE_DOCUMENT_SPANS_BENCH: BenchMetadata = {
	id: "ai.retrieve-document-spans",
	name: "ai retrieve_document_spans ranked lookup",
};

export const AI_MARKDOWN_FULL_REPLACE_TABLE_INSERT_BENCH: BenchMetadata = {
	id: "ai.markdown-full-replace-table-insert",
	name: "ai markdown full replace table insert",
};

export const AI_AUTOCOMPLETE_CANCEL_CHURN_BENCH: BenchMetadata = {
	id: "ai.autocomplete-cancel-churn",
	name: "ai autocomplete cancel churn",
	targetMs: 10,
	critical: true,
};

export const AI_AUTOCOMPLETE_REQUESTING_CANCEL_CHURN_BENCH: BenchMetadata = {
	id: "ai.autocomplete-requesting-cancel-churn",
	name: "ai autocomplete requesting cancel churn",
	targetMs: 20,
};

export const AI_AUTOCOMPLETE_PROVIDER_BUDGET_BENCH: BenchMetadata = {
	id: "ai.autocomplete-provider-budget",
	name: "ai autocomplete provider budget",
	targetMs: 25,
	critical: true,
};

export const AI_AUTOCOMPLETE_PARTIAL_ACCEPT_BENCH: BenchMetadata = {
	id: "ai.autocomplete-partial-accept",
	name: "ai autocomplete partial accept",
	targetMs: 20,
	critical: true,
};

export const AI_AUTOCOMPLETE_PREFETCH_AFTER_ACCEPT_BENCH: BenchMetadata = {
	id: "ai.autocomplete-prefetch-after-accept",
	name: "ai autocomplete prefetch after accept",
	targetMs: 30,
	critical: true,
};

const scale3DocumentSize100 = getScale3Baseline(
	"scale3.keystroke.realistic-stack.document-size.100",
);
const scale3DocumentSize1000 = getScale3Baseline(
	"scale3.keystroke.realistic-stack.document-size.1000",
);
const scale3ExtensionCountPlus8 = getScale3Baseline(
	"scale3.keystroke.realistic-stack.extension-count.plus8",
);
const scale3DecorationCount256 = getScale3Baseline(
	"scale3.keystroke.realistic-stack.decoration-count.256",
);
const scale3RemoteCaretCount8 = getScale3Baseline(
	"scale3.keystroke.realistic-stack.remote-caret-count.8",
);

export const SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH: BenchMetadata = {
	id: scale3DocumentSize100.id,
	name: "SCALE3 keystroke realistic-stack document-size 100",
	targetMs: scale3DocumentSize100.gateP50Ms,
	critical: true,
};

export const SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH: BenchMetadata = {
	id: scale3DocumentSize1000.id,
	name: "SCALE3 keystroke realistic-stack document-size 1000",
	targetMs: scale3DocumentSize1000.gateP50Ms,
	critical: true,
};

export const SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH: BenchMetadata = {
	id: scale3ExtensionCountPlus8.id,
	name: "SCALE3 keystroke realistic-stack extension-count plus8",
	targetMs: scale3ExtensionCountPlus8.gateP50Ms,
	critical: true,
};

export const SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH: BenchMetadata = {
	id: scale3DecorationCount256.id,
	name: "SCALE3 keystroke realistic-stack decoration-count 256",
	targetMs: scale3DecorationCount256.gateP50Ms,
	critical: true,
};

export const SCALE3_KEYSTROKE_REMOTE_CARET_COUNT_8_BENCH: BenchMetadata = {
	id: scale3RemoteCaretCount8.id,
	name: "SCALE3 keystroke realistic-stack remote-caret-count 8",
	targetMs: scale3RemoteCaretCount8.gateP50Ms,
	critical: true,
};

export const BENCHMARK_METADATA: BenchMetadata[] = [
	CRDT_INSERT_1000_BLOCKS_BENCH,
	ANCHORS_ENCODE_SIZE_1000_BENCH,
	ANCHORS_RESOLVE_70K_1000_BENCH,
	ANCHORS_RESOLVE_200_BLOCKS_BENCH,
	ANCHORS_SPLIT_FOLLOW_BENCH,
	ANCHORS_ENCODE_SIZE_CELL_1000_BENCH,
	ANCHORS_RESOLVE_CELL_70K_1000_BENCH,
	ANCHORS_RESOLVE_200_CELLS_BENCH,
	ANCHORS_CELL_IN_BLOCK_EDIT_BENCH,
	CRDT_ENCODE_STATE_500_BENCH,
	CRDT_LOAD_DOCUMENT_500_BENCH,
	CRDT_FORK_MERGE_100_BENCH,
	SCHEMA_RESOLVE_X10000_BENCH,
	SCHEMA_NORMALIZE_500_BLOCK_DOCUMENT_BENCH,
	SCHEMA_ALL_BLOCK_DISPLAYS_BENCH,
	STREAMING_GEN_DELTA_1000_PARTS_BENCH,
	STREAMING_BATCH_FLUSH_LATENCY_BENCH,
	EXTENSION_DISPATCH_OBSERVE_X5_BENCH,
	EXTENSION_COLLECT_DECORATIONS_X5_BENCH,
	EDITOR_APPLY_INSERT_TEXT_X1000_BENCH,
	EDITOR_APPLY_INSERT_DELETE_BLOCK_X500_BENCH,
	AI_READ_DOCUMENT_SUMMARY_200_BLOCKS_BENCH,
	AI_GET_CONTEXT_SUMMARY_200_BLOCKS_BENCH,
	AI_GET_CURSOR_CONTEXT_BENCH,
	AI_PROMPT_ASSEMBLY_TOOL_JOURNAL_BENCH,
	AI_READ_DOCUMENT_RANGE_20_BLOCKS_BENCH,
	AI_RETRIEVE_DOCUMENT_SPANS_BENCH,
	AI_MARKDOWN_FULL_REPLACE_TABLE_INSERT_BENCH,
	AI_AUTOCOMPLETE_CANCEL_CHURN_BENCH,
	AI_AUTOCOMPLETE_REQUESTING_CANCEL_CHURN_BENCH,
	AI_AUTOCOMPLETE_PROVIDER_BUDGET_BENCH,
	AI_AUTOCOMPLETE_PARTIAL_ACCEPT_BENCH,
	AI_AUTOCOMPLETE_PREFETCH_AFTER_ACCEPT_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH,
	SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH,
	SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH,
	SCALE3_KEYSTROKE_REMOTE_CARET_COUNT_8_BENCH,
];

export function findBenchMetadataById(id: string): BenchMetadata | undefined {
	return BENCHMARK_METADATA.find((bench) => bench.id === id);
}

export function findBenchMetadataByName(name: string): BenchMetadata | undefined {
	return BENCHMARK_METADATA.find((bench) => bench.name === name);
}
