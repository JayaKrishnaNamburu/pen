/**
 * Documented agentic-loop step bound (`maxSteps` in `@input/pen-ai`, default 10).
 * This package does not enforce steps; the loop does. The first limit hit —
 * steps, calls, or ops — ends the turn. Do not raise these budgets to "match"
 * a longer loop: they are the document-mutation ceiling.
 */
export const AI_AGENTIC_MAX_STEPS_DEFAULT = 10;

/** Maximum model-requested tool calls in one turn, including denied attempts. */
export const AI_TOOL_MAX_CALLS_PER_TURN = 20;

/** Maximum document ops a single permitted tool call may apply. */
export const AI_TOOL_MAX_OPS_PER_CALL = 32;

/** Maximum document ops a turn may apply in total. */
export const AI_TOOL_MAX_TOTAL_OPS_PER_TURN = 128;

export const AI_TOOL_UNCONFIRMED_CODE = "ai-tool-unconfirmed";

/** A tool classified read-only called `editor.apply` or `openTextStream`; the write was dropped. */
export const AI_TOOL_READ_ONLY_MUTATION_CODE = "ai-tool-read-only-mutation";

export const AI_READ_ONLY_TOOL_NAMES = [
  "read_document",
  "get_context",
  "get_cursor_context",
  "inspect_target",
  "list_valid_operations",
  "search_document",
  "retrieve_document_spans",
  "list_block_types",
] as const;

export const AI_MUTATING_TOOL_NAMES = [
  "insert_block",
  "update_block",
  "delete_block",
  "move_block",
  "write_document",
] as const;

/** Delete and replace-document-scale rewrites (AIB3 destructive). */
export const AI_DESTRUCTIVE_TOOL_NAMES = [
  "delete_block",
  "write_document",
] as const;

export const AI_READ_ONLY_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  AI_READ_ONLY_TOOL_NAMES,
);

export const AI_DESTRUCTIVE_TOOL_NAME_SET: ReadonlySet<string> = new Set(
  AI_DESTRUCTIVE_TOOL_NAMES,
);
