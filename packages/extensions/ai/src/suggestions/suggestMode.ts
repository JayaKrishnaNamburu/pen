import type { DocumentOp, Editor, OpOrigin } from "@pen/types";
import { getOpOriginType } from "@pen/types";
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

export function interceptApplyForSuggestMode(
	ops: DocumentOp[],
	editor: Editor,
	author: string,
	authorType: "user" | "ai",
	model?: string,
	sessionId?: string,
	options: SuggestModeSuggestionOptions = {},
): DocumentOp[] {
	return interceptApplyForSuggestModeWithMetadata(
		ops,
		editor,
		author,
		authorType,
		model,
		sessionId,
		options,
	).operations;
}

export type InterceptApplyForSuggestModeResult = {
	operations: DocumentOp[];
	suggestionIds: string[];
	suggestions: PersistentSuggestion[];
};

export function interceptApplyForSuggestModeWithMetadata(
	ops: DocumentOp[],
	editor: Editor,
	author: string,
	authorType: "user" | "ai",
	model?: string,
	sessionId?: string,
	options: SuggestModeSuggestionOptions = {},
): InterceptApplyForSuggestModeResult {
	const intercepted: DocumentOp[] = [];
	const suggestions: PersistentSuggestion[] = [];
	let suggestionIdIndex = 0;
	const nextSuggestionOptions = (): RequiredSuggestionCreationOptions => {
		const suggestionId =
			options.suggestionIds?.[suggestionIdIndex] ?? crypto.randomUUID();
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

	for (const op of ops) {
		switch (op.type) {
			case "insert-text": {
				const suggestionOptions = nextSuggestionOptions();
				pushTextSuggestion(
					"insert",
					op.blockId,
					op.offset,
					op.text.length,
					suggestionOptions,
				);
				intercepted.push({
					...op,
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
				break;
			}

			case "replace-text": {
				if (op.length > 0) {
					const suggestionOptions = nextSuggestionOptions();
					pushTextSuggestion(
						"delete",
						op.blockId,
						op.offset,
						op.length,
						suggestionOptions,
					);
					intercepted.push({
						type: "format-text",
						blockId: op.blockId,
						offset: op.offset,
						length: op.length,
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
				if (op.text.length > 0) {
					const suggestionOptions = nextSuggestionOptions();
					pushTextSuggestion(
						"insert",
						op.blockId,
						op.offset + op.length,
						op.text.length,
						suggestionOptions,
					);
					intercepted.push({
						type: "insert-text",
						blockId: op.blockId,
						offset: op.offset + op.length,
						text: op.text,
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
				break;
			}

			case "delete-text": {
				const suggestionOptions = nextSuggestionOptions();
				pushTextSuggestion(
					"delete",
					op.blockId,
					op.offset,
					op.length,
					suggestionOptions,
				);
				intercepted.push({
					type: "format-text",
					blockId: op.blockId,
					offset: op.offset,
					length: op.length,
					marks: createSuggestionMark(
						"delete",
						author,
						authorType,
						model,
						sessionId,
						suggestionOptions,
					),
				});
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

			case "convert-block": {
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

			default:
				intercepted.push(op);
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
};

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
		id: options.suggestionId ?? crypto.randomUUID(),
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
