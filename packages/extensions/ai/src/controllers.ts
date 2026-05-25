import type {
	AIInlineHistoryController,
	AIInlineHistoryDirection,
	AIReviewController,
	PersistentSuggestion,
} from "./types";

export class AIInlineHistoryService implements AIInlineHistoryController {
	constructor(
		private readonly handlers: {
			canUndoInlineHistory: () => boolean;
			canRedoInlineHistory: () => boolean;
			canHandleShortcut: (direction: AIInlineHistoryDirection) => boolean;
			handleShortcut: (direction: AIInlineHistoryDirection) => boolean;
			undoInlineHistory: () => boolean;
			redoInlineHistory: () => boolean;
		},
	) {}

	canUndoInlineHistory(): boolean {
		return this.handlers.canUndoInlineHistory();
	}

	canRedoInlineHistory(): boolean {
		return this.handlers.canRedoInlineHistory();
	}

	canHandleShortcut(direction: AIInlineHistoryDirection): boolean {
		return this.handlers.canHandleShortcut(direction);
	}

	handleShortcut(direction: AIInlineHistoryDirection): boolean {
		return this.handlers.handleShortcut(direction);
	}

	undoInlineHistory(): boolean {
		return this.handlers.undoInlineHistory();
	}

	redoInlineHistory(): boolean {
		return this.handlers.redoInlineHistory();
	}
}

export class AIReviewService implements AIReviewController {
	constructor(
		private readonly handlers: {
			getSuggestions: () => readonly PersistentSuggestion[];
			acceptSuggestion: (id: string) => boolean;
			rejectSuggestion: (id: string) => boolean;
			acceptAllSuggestions: () => void;
			rejectAllSuggestions: () => void;
		},
	) {}

	getSuggestions(): readonly PersistentSuggestion[] {
		return this.handlers.getSuggestions();
	}

	acceptSuggestion(id: string): boolean {
		return this.handlers.acceptSuggestion(id);
	}

	rejectSuggestion(id: string): boolean {
		return this.handlers.rejectSuggestion(id);
	}

	acceptAllSuggestions(): void {
		this.handlers.acceptAllSuggestions();
	}

	rejectAllSuggestions(): void {
		this.handlers.rejectAllSuggestions();
	}
}
