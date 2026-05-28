import type { Editor, OpOrigin } from "@pen/types";
import type { DocumentOp } from "@pen/types";
import type { GenerationState, AISession } from "../types";
import { applySuggestedAIOperations } from "../suggestions/applySuggestedAIOperations";
import { AI_SESSION_SUGGESTION_ORIGIN } from "../suggestions/suggestMode";

export interface SuggestedAIOperationRunnerOptions {
	editor: Editor;
	author: string;
	model?: string;
	getSession: (sessionId: string) => AISession | null;
	getActiveGeneration: () => GenerationState | null;
}

export class SuggestedAIOperationRunner {
	constructor(private readonly options: SuggestedAIOperationRunnerOptions) {}

	apply(
		operations: DocumentOp[],
		sessionId?: string,
		options?: {
			createdAt?: number;
			generationId?: string;
			origin?: OpOrigin;
			requestId?: string;
			suggestionIds?: readonly string[];
			turnId?: string;
			undoGroupId?: string;
		},
	): void {
		const session =
			sessionId != null ? this.options.getSession(sessionId) : null;
		const activeGeneration = this.options.getActiveGeneration();
		const undoGroupId =
			options?.undoGroupId ??
			(session?.surface === "bottom-chat" &&
			activeGeneration != null &&
			activeGeneration.sessionId === sessionId
				? activeGeneration.undoGroupId
				: undefined);

		applySuggestedAIOperations(this.options.editor, {
			operations,
			author: this.options.author,
			authorType: "ai",
			model: this.options.model,
			createdAt: options?.createdAt,
			generationId: options?.generationId,
			requestId: options?.requestId,
			sessionId,
			suggestionIds: options?.suggestionIds,
			turnId: options?.turnId,
			origin: options?.origin ?? (sessionId ? AI_SESSION_SUGGESTION_ORIGIN : "extension"),
			undoGroupId,
		});
	}
}
