import { aiControllerFacet } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import type {
	AICommandExecutionOptions,
	AIController,
	AISession,
	AISessionResolution,
	AISurface,
} from "@input/pen-ai";

export function useAIActions(editor: Editor): {
	runPrompt: (
		prompt: string,
		options?: AICommandExecutionOptions,
	) => Promise<unknown>;
	acceptSuggestion: (id: string) => boolean;
	rejectSuggestion: (id: string) => boolean;
	acceptAllSuggestions: () => void;
	rejectAllSuggestions: () => void;
	acceptActiveGeneration: () => boolean;
	retryActiveGeneration: () => Promise<unknown>;
	openCommandMenu: () => void;
	closeCommandMenu: () => void;
	startSession: (input: {
		surface: AISurface;
		target?: "auto" | "selection" | "block" | "document";
	}) => AISession | null;
	openContextualPrompt: (input?: {
		surface?: Extract<AISurface, "inline-edit">;
		target?: "auto" | "selection" | "block" | "document";
	}) => AISession | null;
	runSessionPrompt: (
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	) => Promise<unknown>;
	resolveSessionTurn: (
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
	) => boolean;
	resolveSession: (
		sessionId: string,
		resolution: AISessionResolution,
	) => boolean;
	acceptSession: (sessionId: string) => boolean;
	rejectSession: (sessionId: string) => boolean;
	cancelSession: (sessionId: string) => void;
} {
	const controller =
		(editor.facet(aiControllerFacet) as AIController | null) ?? null;

	return {
		runPrompt(prompt: string, options?: AICommandExecutionOptions) {
			if (!controller) {
				return Promise.resolve(null);
			}
			return controller.runPrompt(prompt, options);
		},
		acceptSuggestion(id: string) {
			return controller?.acceptSuggestion(id) ?? false;
		},
		rejectSuggestion(id: string) {
			return controller?.rejectSuggestion(id) ?? false;
		},
		acceptAllSuggestions() {
			controller?.acceptAllSuggestions();
		},
		rejectAllSuggestions() {
			controller?.rejectAllSuggestions();
		},
		acceptActiveGeneration() {
			return controller?.acceptActiveGeneration() ?? false;
		},
		retryActiveGeneration() {
			if (!controller) {
				return Promise.resolve(null);
			}
			return controller.retryActiveGeneration();
		},
		openCommandMenu() {
			controller?.openCommandMenu();
		},
		closeCommandMenu() {
			controller?.closeCommandMenu();
		},
		startSession(input) {
			return controller?.startSession(input) ?? null;
		},
		openContextualPrompt(input) {
			return controller?.openContextualPrompt(input) ?? null;
		},
		runSessionPrompt(sessionId, prompt, options) {
			if (!controller) {
				return Promise.resolve(null);
			}
			return controller.runSessionPrompt(sessionId, prompt, options);
		},
		resolveSessionTurn(sessionId, turnId, resolution) {
			return (
				controller?.resolveSessionTurn(sessionId, turnId, resolution) ??
				false
			);
		},
		resolveSession(sessionId, resolution) {
			return controller?.resolveSession(sessionId, resolution) ?? false;
		},
		acceptSession(sessionId) {
			return controller?.acceptSession(sessionId) ?? false;
		},
		rejectSession(sessionId) {
			return controller?.rejectSession(sessionId) ?? false;
		},
		cancelSession(sessionId) {
			controller?.cancelSession(sessionId);
		},
	};
}
