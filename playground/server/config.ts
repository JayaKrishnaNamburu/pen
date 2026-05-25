import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

export const PLAYGROUND_SERVER_HOST =
	process.env.PLAYGROUND_AI_HOST ?? "127.0.0.1";
export const PLAYGROUND_SERVER_PORT = Number(
	process.env.PLAYGROUND_AI_PORT ?? "8787",
);
export const PLAYGROUND_COLLAB_ROUTE_PREFIX = "/collaboration";
export const PLAYGROUND_COLLAB_DEFAULT_DOC_NAME = "pen-playground";
export const PLAYGROUND_DOCUMENT_MODEL = normalizePlaygroundModelName(
	process.env.PLAYGROUND_AI_MODEL,
);
export const PLAYGROUND_SELECTION_MODEL = normalizePlaygroundSelectionModelName(
	process.env.PLAYGROUND_AI_SELECTION_MODEL,
);
export const PLAYGROUND_SELECTION_FAST_PATH_SYSTEM_PROMPT =
	"You are the local AI rewrite engine for the Pen editor. " +
	"Return only the exact replacement text for the current selection. " +
	"Do not add commentary, labels, markdown fences, or quotation marks around the answer.";
export const PLAYGROUND_AUTOCOMPLETE_OUTPUT_TOKEN_CAP = 128;
export const PLAYGROUND_DOCUMENT_SYSTEM_PROMPT =
	"You are the local AI assistant for the Pen playground. " +
	"Return only the document content to insert into the editor, wrapped in <pen_local_operation>...</pen_local_operation> tags. " +
	"The resolved operation envelope in the prompt is authoritative for scope, placement, and replace-vs-remove behavior. " +
	"If the operation requests removal, return an empty payload wrapper with no refusal text. " +
	"Do not add commentary, analysis, or assistant framing outside the tags. " +
	"Use markdown for headings and structure within the payload wrapper.";
export const PLAYGROUND_STRUCTURED_PLANNER_SYSTEM_PROMPT =
	"You are the structured intent generator for the Pen playground. " +
	"Return exactly one valid Pen structured intent object as JSON. " +
	"Do not include markdown fences, explanatory prose, or conversational text.";
export const SESSION_HEADER = "x-pen-playground-session";
export const PLAYGROUND_SESSION_TTL_MS = 15 * 60 * 1000;
export const PLAYGROUND_SESSION_CLEANUP_INTERVAL_MS = 60 * 1000;
export const PLAYGROUND_MAX_TOOL_STEPS = 4;
export const PLAYGROUND_DEBUG_LOGS = process.env.PLAYGROUND_AI_DEBUG === "true";
export const PLAYGROUND_SELECTION_SOURCE_CHAR_LIMIT = 12_000;
export const PLAYGROUND_SELECTION_OUTPUT_TOKEN_CAP = 1_200;
export const PLAYGROUND_SELECTION_DEFAULT_OUTPUT_TOKENS = 128;
export const PLAYGROUND_SELECTION_EXPAND_OUTPUT_TOKENS = 640;
export const PLAYGROUND_SELECTION_SUMMARIZE_OUTPUT_TOKENS = 160;
export const PLAYGROUND_SELECTION_TRANSLATE_OUTPUT_TOKENS = 480;
export const PLAYGROUND_SELECTION_STOP_SENTINEL = "<pen:end>";
export const PLAYGROUND_LOCAL_REWRITE_SYSTEM_PROMPT =
	"You are a precise local editor operation. Return only the final replacement content for the requested target inside the required payload wrapper. Do not include analysis, narration, tool chatter, labels, or quotes outside the wrapper.";
export const PLAYGROUND_LOCAL_CONTINUE_SYSTEM_PROMPT =
	"You are a precise local editor operation. Return only the continuation text that should be inserted at the requested cursor position inside the required payload wrapper. Do not repeat the existing content, and do not include analysis, narration, tool chatter, labels, or quotes outside the wrapper.";
export const PLAYGROUND_SKILLS_ROUTE = "/api/skills";
export const PLAYGROUND_TOOL_ROUTE_PREFIX = "/api/tools/";
export const PLAYGROUND_SESSION_DIAGNOSTICS_ROUTE =
	"/api/ai/session/diagnostics";
export const PLAYGROUND_EXTENSION_ROOT_NAMESPACE = "pen.playground";
export const PLAYGROUND_EXTENSION_ROOT_VERSION = 1;
export const PLAYGROUND_DIRECT_TOOL_NAMES = new Set([
	"get_context",
	"read_document",
	"search_document",
	"list_block_types",
]);

export function createPlaygroundLanguageModel(modelId: string): LanguageModel {
	return anthropic(modelId as Parameters<typeof anthropic>[0]);
}

export function roundMs(value: number | null): number | null {
	if (value == null || !Number.isFinite(value)) {
		return null;
	}
	return Math.round(value * 100) / 100;
}

export function normalizePlaygroundModelName(
	modelName: string | undefined,
): string {
	if (!modelName) {
		return "claude-sonnet-4-5";
	}
	return modelName
		.trim()
		.replace(/^claude-3-haiku$/i, "claude-3-haiku-20240307")
		.replace(/^claude-sonnet-4\.5$/i, "claude-sonnet-4-5")
		.replace(/^claude-sonnet-4\.6$/i, "claude-sonnet-4-6");
}

function normalizePlaygroundSelectionModelName(
	modelName: string | undefined,
): string {
	if (!modelName) {
		return "claude-haiku-4-5";
	}
	return normalizePlaygroundModelName(modelName);
}

export function logPlaygroundEvent(
	event: string,
	payload: Record<string, unknown>,
): void {
	if (!PLAYGROUND_DEBUG_LOGS) {
		return;
	}
	const timestamp = new Date().toISOString();
	console.log(`[playground-ai] ${timestamp} ${event}`, payload);
}
