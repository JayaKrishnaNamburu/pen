import type { OpOrigin } from "@pen/types";
import type { AIInlineCompletionController } from "../../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	rejectAllSuggestions,
	rejectSuggestion,
	rejectSuggestions,
} from "../../suggestions/acceptReject";
import { readAllSuggestions } from "../../suggestions/persistent";
import { AI_SESSION_SUGGESTION_ORIGIN } from "../../suggestions/suggestMode";
import { areSuggestionsEqual } from "../extensionHelpers";

export const suggestionControllerMethods = {
	showEphemeralSuggestion(
		this: AIControllerMethodHost,
		suggestion: Parameters<
			AIInlineCompletionController["showSuggestion"]
		>[0],
	): void {
		this._inlineCompletion.showSuggestion(suggestion);
	},

	dismissEphemeralSuggestion(this: AIControllerMethodHost): void {
		this._inlineCompletion.dismissSuggestion();
	},

	acceptEphemeralSuggestion(this: AIControllerMethodHost): void {
		this._inlineCompletion.acceptSuggestion();
	},

	getSuggestions(this: AIControllerMethodHost) {
		return this._suggestions;
	},

	handleDocumentChange(
		this: AIControllerMethodHost,
		events: readonly {
			origin: OpOrigin;
			affectedBlocks: readonly string[];
		}[],
	): void {
		if (events.length > 0) {
			this._documentVersion += 1;
		}
		const previousState = this._state;
		const suggestionsChanged = this._syncSuggestionsFromDocument();
		const sessionsChanged = this._syncSessionsFromDocument();
		this.handleExternalCommit(events);
		if (this._state === previousState) {
			this._editor.requestDecorationUpdate();
			if (suggestionsChanged || sessionsChanged) {
				this._emit();
			}
		}
	},

	_syncSuggestionResolutionState(this: AIControllerMethodHost): void {
		const suggestionsChanged = this._syncSuggestionsFromDocument();
		const sessionsChanged = this._syncSessionsFromDocument();
		if (!suggestionsChanged && !sessionsChanged) {
			return;
		}
		this._editor.requestDecorationUpdate();
		this._emit();
	},

	acceptSuggestion(this: AIControllerMethodHost, id: string): boolean {
		const accepted = acceptSuggestion(this._editor, id);
		if (accepted) {
			this._syncSuggestionResolutionState();
		}
		return accepted;
	},

	rejectSuggestion(this: AIControllerMethodHost, id: string): boolean {
		const rejected = rejectSuggestion(this._editor, id);
		if (rejected) {
			this._syncSuggestionResolutionState();
		}
		return rejected;
	},

	_rejectPreviewSuggestions(
		this: AIControllerMethodHost,
		suggestionIds: readonly string[],
	): void {
		if (suggestionIds.length === 0) {
			return;
		}
		const rejected = rejectSuggestions(this._editor, suggestionIds, {
			origin: AI_SESSION_SUGGESTION_ORIGIN,
			undoGroupId: this._state.activeGeneration?.undoGroupId,
		});
		if (rejected) {
			this._syncSuggestionResolutionState();
		}
	},

	acceptAllSuggestions(this: AIControllerMethodHost): void {
		acceptAllSuggestions(this._editor);
		this._syncSuggestionResolutionState();
	},

	rejectAllSuggestions(this: AIControllerMethodHost): void {
		rejectAllSuggestions(this._editor);
		this._syncSuggestionResolutionState();
	},

	_syncSuggestionsFromDocument(this: AIControllerMethodHost): boolean {
		const nextSuggestions = readAllSuggestions(this._editor);
		if (areSuggestionsEqual(this._suggestions, nextSuggestions)) {
			return false;
		}
		this._suggestions = nextSuggestions;
		return true;
	},
};
