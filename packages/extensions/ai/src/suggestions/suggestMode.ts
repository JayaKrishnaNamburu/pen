import type { DocumentOp, Editor, OpOrigin } from "@input/pen-types";
import { getOpOriginType } from "@input/pen-core";
import { generateId } from "@input/pen-types";
import {
	createSuggestionMark,
	serializeBlockSuggestionMeta,
	type BlockSuggestionMetaPayload,
	type SuggestionCreationOptions,
} from "./persistent";
import type { BlockSuggestionMeta, PersistentSuggestion } from "../types";

export const SUGGESTION_RESOLUTION_ORIGIN = "suggestion-resolution";
export const AI_SESSION_SUGGESTION_ORIGIN = "ai-session";

const BYPASS_ORIGINS = new Set([
	AI_SESSION_SUGGESTION_ORIGIN,
	"collaborator",
	"history",
	"import",
	"system",
	"extension",
	SUGGESTION_RESOLUTION_ORIGIN,
]);

export function shouldBypassSuggestMode(origin?: OpOrigin): boolean {
	return origin != null && BYPASS_ORIGINS.has(getOpOriginType(origin));
}

export function transformOpsForSuggestMode(
	ops: DocumentOp[],
	editor: Editor,
	author: string,
	authorType: "user" | "ai",
	model?: string,
	sessionId?: string,
	options: SuggestModeSuggestionOptions = {},
): DocumentOp[] {
	return transformOpsForSuggestModeWithMetadata(
		ops,
		editor,
		author,
		authorType,
		model,
		sessionId,
		options,
	).operations;
}

export type SuggestModeTransformResult = {
	operations: DocumentOp[];
	suggestionIds: string[];
	suggestions: PersistentSuggestion[];
};

export function transformOpsForSuggestModeWithMetadata(
	ops: DocumentOp[],
	editor: Editor,
	author: string,
	authorType: "user" | "ai",
	model?: string,
	sessionId?: string,
	options: SuggestModeSuggestionOptions = {},
): SuggestModeTransformResult {
	const intercepted: DocumentOp[] = [];
	const suggestions: PersistentSuggestion[] = [];
	let suggestionIdIndex = 0;
	const nextSuggestionOptions = (): RequiredSuggestionCreationOptions => {
		const suggestionId =
			options.suggestionIds?.[suggestionIdIndex] ?? generateId();
		suggestionIdIndex += 1;
		return {
			requestId: options.requestId,
			sessionId,
			turnId: options.turnId,
			generationId: options.generationId,
			createdAt: options.createdAt ?? Date.now(),
			suggestionId,
		};
	};
	const pushTextSuggestion = (
		action: "insert" | "delete",
		blockId: string,
		offset: number,
		length: number,
		suggestionOptions: RequiredSuggestionCreationOptions,
	) => {
		suggestions.push({
			kind: "text",
			id: suggestionOptions.suggestionId,
			action,
			author,
			authorType,
			createdAt: suggestionOptions.createdAt,
			model,
			sessionId: suggestionOptions.sessionId,
			requestId: suggestionOptions.requestId,
			turnId: suggestionOptions.turnId,
			generationId: suggestionOptions.generationId,
			blockId,
			offset,
			length,
		});
	};
	const pushBlockSuggestion = (
		action: BlockSuggestionMeta["action"],
		blockId: string,
		previousState: BlockSuggestionMeta["previousState"],
		suggestionOptions: RequiredSuggestionCreationOptions,
	) => {
		suggestions.push({
			kind: "block",
			id: suggestionOptions.suggestionId,
			action,
			author,
			authorType,
			createdAt: suggestionOptions.createdAt,
			model,
			sessionId: suggestionOptions.sessionId,
			requestId: suggestionOptions.requestId,
			turnId: suggestionOptions.turnId,
			generationId: suggestionOptions.generationId,
			blockId,
			previousState,
		});
	};

	const intent =
		options.origin && typeof options.origin === "object"
			? options.origin.intent
			: undefined;

	for (const op of ops) {
		if (intent === "pen.splitBlock" && op.type === "insert-block") {
			const suggestionOptions = nextSuggestionOptions();
			pushBlockSuggestion(
				"split-block",
				op.blockId,
				undefined,
				suggestionOptions,
			);
			intercepted.push(op);
			intercepted.push({
				type: "set-meta",
				blockId: op.blockId,
				namespace: "suggestion",
				data: createBlockSuggestionMeta(
					"split-block",
					author,
					authorType,
					model,
					undefined,
					sessionId,
					suggestionOptions,
				),
			});
			continue;
		}

		switch (op.type) {
			case "splice-text": {
				const deleteLen = op.to - op.from;
				const insertLen = spliceInsertLength(op.insert);
				if (deleteLen > 0) {
					const suggestionOptions = nextSuggestionOptions();
					pushTextSuggestion(
						"delete",
						op.blockId,
						op.from,
						deleteLen,
						suggestionOptions,
					);
					intercepted.push({
						type: "format-text",
						blockId: op.blockId,
						from: op.from,
						to: op.to,
						marks: createSuggestionMark(
							"delete",
							author,
							authorType,
							model,
							sessionId,
							suggestionOptions,
						),
					});
				}
				if (insertLen > 0) {
					const suggestionOptions = nextSuggestionOptions();
					pushTextSuggestion(
						"insert",
						op.blockId,
						op.from + deleteLen,
						insertLen,
						suggestionOptions,
					);
					intercepted.push({
						...op,
						from: op.from + deleteLen,
						to: op.from + deleteLen,
						marks: {
							...(op.marks ?? {}),
							...createSuggestionMark(
								"insert",
								author,
								authorType,
								model,
								sessionId,
								suggestionOptions,
							),
						},
					});
				}
				if (deleteLen === 0 && insertLen === 0) {
					intercepted.push(op);
				}
				break;
			}

			case "insert-block": {
				const suggestionOptions = nextSuggestionOptions();
				pushBlockSuggestion(
					"insert-block",
					op.blockId,
					undefined,
					suggestionOptions,
				);
				intercepted.push(op);
				intercepted.push({
					type: "set-meta",
					blockId: op.blockId,
					namespace: "suggestion",
					data: createBlockSuggestionMeta(
						"insert-block",
						author,
						authorType,
						model,
						undefined,
						sessionId,
						suggestionOptions,
					),
				});
				break;
			}

			case "delete-block": {
				const suggestionOptions = nextSuggestionOptions();
				pushBlockSuggestion(
					"delete-block",
					op.blockId,
					undefined,
					suggestionOptions,
				);
				intercepted.push({
					type: "set-meta",
					blockId: op.blockId,
					namespace: "suggestion",
					data: createBlockSuggestionMeta(
						"delete-block",
						author,
						authorType,
						model,
						undefined,
						sessionId,
						suggestionOptions,
					),
				});
				break;
			}

			case "move-block": {
				const block = editor.getBlock(op.blockId);
				const layoutParent = block?.layoutParent();
				const previousState: BlockSuggestionMeta["previousState"] = {
					position: layoutParent
						? {
								parent: layoutParent.id,
								index: block?.index ?? 0,
							}
						: block?.prev
							? { after: block.prev.id }
							: "first",
				};
				const suggestionOptions = nextSuggestionOptions();
				pushBlockSuggestion(
					"move-block",
					op.blockId,
					previousState,
					suggestionOptions,
				);
				intercepted.push(op);
				intercepted.push({
					type: "set-meta",
					blockId: op.blockId,
					namespace: "suggestion",
					data: createBlockSuggestionMeta(
						"move-block",
						author,
						authorType,
						model,
						previousState,
						sessionId,
						suggestionOptions,
					),
				});
				break;
			}

			case "set-props": {
				if (typeof op.props.type === "string") {
					const block = editor.getBlock(op.blockId);
					const previousState: BlockSuggestionMeta["previousState"] = {
						type: block?.type,
						props: block ? { ...block.props } : undefined,
					};
					const suggestionOptions = nextSuggestionOptions();
					pushBlockSuggestion(
						"convert-block",
						op.blockId,
						previousState,
						suggestionOptions,
					);
					intercepted.push(op);
					intercepted.push({
						type: "set-meta",
						blockId: op.blockId,
						namespace: "suggestion",
						data: createBlockSuggestionMeta(
							"convert-block",
							author,
							authorType,
							model,
							previousState,
							sessionId,
							suggestionOptions,
						),
					});
					break;
				}
				intercepted.push(op);
				break;
			}

			case "format-text":
			case "set-meta":
			case "grid":
			case "app":
			case "stream-open":
				intercepted.push(op);
				break;
			default: {
				const _exhaustive: never = op;
				void _exhaustive;
				intercepted.push(op);
			}
		}
	}

	return {
		operations: intercepted,
		suggestionIds: suggestions.map((suggestion) => suggestion.id),
		suggestions,
	};
}

export type SuggestModeSuggestionOptions = {
	requestId?: string;
	turnId?: string;
	generationId?: string;
	createdAt?: number;
	suggestionIds?: readonly string[];
	origin?: OpOrigin;
};

function spliceInsertLength(insert: unknown): number {
	const items = Array.isArray(insert) ? insert : [insert];
	let length = 0;
	for (const item of items) {
		length += typeof item === "string" ? item.length : 1;
	}
	return length;
}

type RequiredSuggestionCreationOptions = SuggestionCreationOptions & {
	suggestionId: string;
	createdAt: number;
};

function createBlockSuggestionMeta(
	action: BlockSuggestionMeta["action"],
	author: string,
	authorType: "user" | "ai",
	model?: string,
	previousState?: BlockSuggestionMeta["previousState"],
	sessionId?: string,
	options: SuggestionCreationOptions = {},
): BlockSuggestionMetaPayload {
	const resolvedSessionId = options.sessionId ?? sessionId;
	const meta: BlockSuggestionMeta = {
		id: options.suggestionId ?? generateId(),
		action,
		author,
		authorType,
		createdAt: options.createdAt ?? Date.now(),
		model,
		previousState,
		sessionId: resolvedSessionId,
		requestId: options.requestId,
		turnId: options.turnId,
		generationId: options.generationId,
	};
	return serializeBlockSuggestionMeta(meta);
}
