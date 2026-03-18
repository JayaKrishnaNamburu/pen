import {
	getAISuggestionsController,
	type AISuggestionsController,
	type AISuggestionsExtensionConfig,
} from "@pen/ai-suggestions";
import type { Editor } from "@pen/types";

type AISuggestionsRuntimePatch = Partial<
	Omit<AISuggestionsExtensionConfig, "model" | "analyzer" | "blockPolicy">
>;

interface PlaygroundAISuggestionsDebugApi {
	help(): Record<string, string>;
	getController(): AISuggestionsController | null;
	getState(): ReturnType<AISuggestionsController["getState"]> | null;
	getSettings(): AISuggestionsExtensionConfig | null;
	updateSettings(patch: AISuggestionsRuntimePatch): AISuggestionsExtensionConfig | null;
	enable(): boolean;
	disable(): boolean;
	trigger(blockId?: string | null): boolean;
	clear(): void;
	applyActive(): boolean;
	dismissActive(): boolean;
	dismissAll(): number;
}

declare global {
	interface Window {
		penPlayground?: {
			aiSuggestions?: PlaygroundAISuggestionsDebugApi;
		};
	}
}

export function installPlaygroundAISuggestionsDebug(editor: Editor): () => void {
	const root = (window.penPlayground ??= {});
	root.aiSuggestions = createDebugApi(editor);

	return () => {
		const playground = window.penPlayground;
		if (playground && playground.aiSuggestions === root.aiSuggestions) {
			delete playground.aiSuggestions;
		}
		if (playground && Object.keys(playground).length === 0) {
			delete window.penPlayground;
		}
	};
}

function createDebugApi(editor: Editor): PlaygroundAISuggestionsDebugApi {
	const resolveController = () => getAISuggestionsController(editor);

	return {
		help() {
			return {
				root: "window.penPlayground.aiSuggestions",
				getState: "window.penPlayground.aiSuggestions.getState()",
				getSettings: "window.penPlayground.aiSuggestions.getSettings()",
				updateSettings:
					'window.penPlayground.aiSuggestions.updateSettings({ debounceMs: 400, minChangedChars: 4, minConfidence: 0.6 })',
				trigger: "window.penPlayground.aiSuggestions.trigger()",
				triggerBlock:
					'window.penPlayground.aiSuggestions.trigger("block-id")',
				enable: "window.penPlayground.aiSuggestions.enable()",
				disable: "window.penPlayground.aiSuggestions.disable()",
				applyActive: "window.penPlayground.aiSuggestions.applyActive()",
				dismissActive: "window.penPlayground.aiSuggestions.dismissActive()",
				dismissAll: "window.penPlayground.aiSuggestions.dismissAll()",
			};
		},
		getController() {
			return resolveController();
		},
		getState() {
			return resolveController()?.getState() ?? null;
		},
		getSettings() {
			return resolveController()?.getRuntimeSettings() ?? null;
		},
		updateSettings(patch) {
			return resolveController()?.updateRuntimeSettings(patch) ?? null;
		},
		enable() {
			const controller = resolveController();
			if (!controller) {
				return false;
			}
			controller.setEnabled(true);
			return true;
		},
		disable() {
			const controller = resolveController();
			if (!controller) {
				return false;
			}
			controller.setEnabled(false);
			return true;
		},
		trigger(blockId) {
			return resolveController()?.request({ force: true, blockId }) ?? false;
		},
		clear() {
			resolveController()?.clearInvalidSuggestions();
		},
		applyActive() {
			const controller = resolveController();
			const suggestionId = controller?.getState().activeSuggestionId ?? null;
			return suggestionId ? controller?.applySuggestion(suggestionId) ?? false : false;
		},
		dismissActive() {
			const controller = resolveController();
			const suggestionId = controller?.getState().activeSuggestionId ?? null;
			return suggestionId
				? controller?.dismissSuggestion(suggestionId) ?? false
				: false;
		},
		dismissAll() {
			const controller = resolveController();
			const state = controller?.getState();
			if (!controller || !state) {
				return 0;
			}
			const blockIds = [...new Set(state.suggestions.map((suggestion) => suggestion.blockId))];
			return blockIds.reduce(
				(total, blockId) => total + controller.dismissAllInBlock(blockId),
				0,
			);
		},
	};
}
