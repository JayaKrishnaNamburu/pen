import type { Position } from "./ops";

/**
 * Contract-layer block-suggestion shape. Runtime review items use
 * `PersistentBlockSuggestion` on `@input/pen-ai`, which also admits
 * `split-block` and `format-text` actions and a `format` previousState.
 */
export interface BlockSuggestion {
	id: string;
	action: "insert-block" | "delete-block" | "move-block" | "convert-block";
	author: string;
	authorType: "user" | "ai";
	createdAt: number;
	model?: string;
	sessionId?: string;
	requestId?: string;
	turnId?: string;
	generationId?: string;
	previousState?: {
		type?: string;
		position?: Position;
		props?: Record<string, unknown>;
	};
}
