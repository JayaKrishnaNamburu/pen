import type { DocumentOp, Editor, OpOrigin } from "@pen/types";
import { getOpOriginType } from "@pen/types";
import {
	createSuggestionMark,
	type SuggestionCreationOptions,
} from "./persistent";
import type { BlockSuggestionMeta } from "../types";

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
	const intercepted: DocumentOp[] = [];
	let suggestionIdIndex = 0;
	const nextSuggestionOptions = (): SuggestionCreationOptions => ({
		requestId: options.requestId,
		sessionId,
		turnId: options.turnId,
		generationId: options.generationId,
		createdAt: options.createdAt,
		suggestionId: options.suggestionIds?.[suggestionIdIndex++],
	});

	for (const op of ops) {
		switch (op.type) {
			case "insert-text": {
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
							nextSuggestionOptions(),
						),
					},
				});
				break;
			}

			case "replace-text": {
				if (op.length > 0) {
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
							nextSuggestionOptions(),
						),
					});
				}
				if (op.text.length > 0) {
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
								nextSuggestionOptions(),
							),
						},
					});
				}
				break;
			}

			case "delete-text": {
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
						nextSuggestionOptions(),
					),
				});
				break;
			}

			case "insert-block": {
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
						nextSuggestionOptions(),
					),
				});
				break;
			}

			case "delete-block": {
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
						nextSuggestionOptions(),
					),
				});
				break;
			}

			case "move-block": {
				const block = editor.getBlock(op.blockId);
				const layoutParent = block?.layoutParent();
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
						{
							position: layoutParent
								? {
										parent: layoutParent.id,
										index: block?.index ?? 0,
									}
								: block?.prev
									? { after: block.prev.id }
									: "first",
						},
						sessionId,
						nextSuggestionOptions(),
					),
				});
				break;
			}

			case "convert-block": {
				const block = editor.getBlock(op.blockId);
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
						{
							type: block?.type,
							props: block ? { ...block.props } : undefined,
						},
						sessionId,
						nextSuggestionOptions(),
					),
				});
				break;
			}

			default:
				intercepted.push(op);
		}
	}

	return intercepted;
}

export type SuggestModeSuggestionOptions = {
	requestId?: string;
	turnId?: string;
	generationId?: string;
	createdAt?: number;
	suggestionIds?: readonly string[];
};

function createBlockSuggestionMeta(
	action: BlockSuggestionMeta["action"],
	author: string,
	authorType: "user" | "ai",
	model?: string,
	previousState?: BlockSuggestionMeta["previousState"],
	sessionId?: string,
	options: SuggestionCreationOptions = {},
): Record<string, unknown> {
	const resolvedSessionId = options.sessionId ?? sessionId;
	return {
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
}
