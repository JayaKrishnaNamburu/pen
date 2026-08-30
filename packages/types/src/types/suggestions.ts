import type { Position } from "./ops";

/**
 * Host-reachable block-suggestion actions. Suggest-mode stages all six:
 * `split-block` from `pen.splitBlock`, `format-text` from `format-text` ops,
 * plus the four structural actions. The contract layer names the full set
 * so a host switch on `BlockSuggestion["action"]` fails compilation when a
 * variant is unhandled (RS7).
 */
export type BlockSuggestionAction =
	| "insert-block"
	| "delete-block"
	| "move-block"
	| "convert-block"
	| "split-block"
	| "format-text";

/** Prior block props, position, or mark range used to reject a suggestion. */
export interface BlockSuggestionPreviousState {
	type?: string;
	position?: Position;
	props?: Record<string, unknown>;
	format?: {
		from: number;
		to: number;
		marks: Record<string, unknown | null>;
		cell?: { row: number; col: number };
	};
}

/**
 * Contract-layer block-suggestion shape. Runtime review items add `kind`
 * and `blockId` as `PersistentBlockSuggestion` on `@input/pen-ai`. The
 * action union and previousState match that runtime (RS7).
 */
export interface BlockSuggestion {
	id: string;
	action: BlockSuggestionAction;
	author: string;
	authorType: "user" | "ai";
	createdAt: number;
	model?: string;
	sessionId?: string;
	requestId?: string;
	turnId?: string;
	generationId?: string;
	previousState?: BlockSuggestionPreviousState;
}
