import { aiExtension } from "@pen/ai";
import type { AISuggestionsExtensionConfig } from "@pen/ai-suggestions";
import {
	aiSuggestionsExtension,
	getAISuggestionsController,
} from "@pen/ai-suggestions";
import {
	autocompleteExtension,
	getAutocompleteController,
	type AutocompleteAcceptanceStrategy,
	type AutocompleteBlockPolicy,
} from "@pen/ai-autocomplete";
import { createEditor } from "@pen/core";
import { databaseExtension } from "@pen/database";
import { inputRulesExtension } from "@pen/input-rules";
import { getMultiplayerController } from "@pen/multiplayer";
import { defaultPreset } from "@pen/preset-default";
import { useMultiplayer } from "@pen/react";
import { searchExtension } from "@pen/search";
import type { Editor } from "@pen/types";
import { useEffect, useState, type MutableRefObject } from "react";
import { PLAYGROUND_AI_DIRECT_STREAM_BATCH_INTERVAL_MS } from "../constants/playgroundAI";
import {
	attachPlaygroundAutocompleteLogging,
	logAutocompleteDebug,
	summarizeAutocompleteState,
} from "../utils/autocompleteDebug";
import { canOpenLinkEditor } from "../utils/linkMarks";
import { createPlaygroundAIModel } from "../utils/playgroundAI";
import { createPlaygroundAISuggestionsAnalyzer } from "../utils/playgroundAISuggestions";
import { installPlaygroundAISuggestionsDebug } from "../utils/playgroundAISuggestionsDebug";
import {
	createPlaygroundCollaborationExtension,
	normalizePlaygroundCollaborationDocument,
} from "../utils/playgroundCollaboration";

const PLAYGROUND_DOCUMENT_PROFILE = "structured" as const;
const PLAYGROUND_AI_CONTENT_FORMAT = {
	blockGeneration: "markdown",
	selectionRewrite: "text",
} as const;
export const PLAYGROUND_AI_AUTOCOMPLETE_DEBOUNCE_MS = 220;
const PLAYGROUND_AI_AUTOCOMPLETE_STALE_AFTER_MS = 5000;
export const DEFAULT_PLAYGROUND_AUTOCOMPLETE_BLOCK_POLICY: AutocompleteBlockPolicy =
	{
		allowInCodeBlocks: true,
		allowInTables: false,
		deniedBlockTypes: ["database"],
	};

export type PlaygroundAutocompleteSettings = {
	enabled: boolean;
	debounceMs: number;
	prefetchAfterAccept: boolean;
	acceptanceStrategy: AutocompleteAcceptanceStrategy;
	blockPolicy: AutocompleteBlockPolicy;
};

export type PlaygroundAISuggestionsSettings = Pick<
	AISuggestionsExtensionConfig,
	| "enabled"
	| "debounceMs"
	| "minChangedChars"
	| "minStableMs"
	| "cooldownMs"
	| "maxScopeChars"
	| "maxSuggestionsPerScope"
	| "minConfidence"
>;

export const DEFAULT_PLAYGROUND_AI_SUGGESTIONS_SETTINGS: PlaygroundAISuggestionsSettings =
	{
		enabled: true,
		debounceMs: 1000,
		minChangedChars: 10,
		minStableMs: 800,
		cooldownMs: 6500,
		maxScopeChars: 500,
		maxSuggestionsPerScope: 3,
		minConfidence: 0.8,
	};

export function PlaygroundCollaborationBootstrap({
	editor,
}: {
	editor: Editor;
}) {
	const multiplayerState = useMultiplayer(editor);

	useEffect(() => {
		if (multiplayerState.connectionState !== "connected") {
			return;
		}

		normalizePlaygroundCollaborationDocument(editor);
	}, [editor, multiplayerState.connectionState]);

	return null;
}

export function usePlaygroundEditor(
	editorRef: MutableRefObject<Editor | null>,
	linkToggleRef: MutableRefObject<(() => void) | null>,
	autocompleteSettings: PlaygroundAutocompleteSettings,
	aiSuggestionsSettings: PlaygroundAISuggestionsSettings,
	collaborationReady: boolean,
): Editor | null {
	const [editor, setEditor] = useState<Editor | null>(null);
	useEffect(() => {
		if (!collaborationReady) {
			setEditor(null);
			return;
		}

		const nextEditor = createPlaygroundEditor(
			linkToggleRef,
			editorRef,
			autocompleteSettings,
			aiSuggestionsSettings,
		);
		editorRef.current = nextEditor;
		setEditor(nextEditor);

		return () => {
			if (editorRef.current === nextEditor) {
				editorRef.current = null;
			}
			getMultiplayerController(nextEditor)?.disconnect();
			nextEditor.destroy();
		};
	}, [collaborationReady, editorRef, linkToggleRef]);

	useEffect(() => {
		if (!editor) {
			return;
		}
		const controller = getAutocompleteController(editor);
		if (!controller) {
			logAutocompleteDebug("controller missing while applying settings", {
				configuredSettings: autocompleteSettings,
			});
			return;
		}
		attachPlaygroundAutocompleteLogging(controller);
		controller.setEnabled(autocompleteSettings.enabled);
		controller.updateRuntimeSettings({
			debounceMs: autocompleteSettings.debounceMs,
			prefetchAfterAccept: autocompleteSettings.prefetchAfterAccept,
			acceptanceStrategy: autocompleteSettings.acceptanceStrategy,
			staleAfterMs: PLAYGROUND_AI_AUTOCOMPLETE_STALE_AFTER_MS,
		});
		controller.updateBlockPolicy(autocompleteSettings.blockPolicy);
		logAutocompleteDebug("applied settings", {
			configuredSettings: autocompleteSettings,
			runtimeState: summarizeAutocompleteState(controller.getState()),
		});
	}, [autocompleteSettings, editor]);

	useEffect(() => {
		if (!editor) {
			return;
		}
		const controller = getAISuggestionsController(editor);
		if (!controller) {
			return;
		}
		controller.setEnabled(aiSuggestionsSettings.enabled ?? true);
		controller.updateRuntimeSettings({
			debounceMs: aiSuggestionsSettings.debounceMs,
			minChangedChars: aiSuggestionsSettings.minChangedChars,
			minStableMs: aiSuggestionsSettings.minStableMs,
			cooldownMs: aiSuggestionsSettings.cooldownMs,
			maxScopeChars: aiSuggestionsSettings.maxScopeChars,
			maxSuggestionsPerScope:
				aiSuggestionsSettings.maxSuggestionsPerScope,
			minConfidence: aiSuggestionsSettings.minConfidence,
		});
	}, [aiSuggestionsSettings, editor]);

	useEffect(() => {
		if (!editor) {
			return;
		}
		return installPlaygroundAISuggestionsDebug(editor);
	}, [editor]);

	return editor;
}

function createPlaygroundEditor(
	linkToggleRef: MutableRefObject<(() => void) | null>,
	editorRef: MutableRefObject<Editor | null>,
	autocompleteSettings: PlaygroundAutocompleteSettings,
	aiSuggestionsSettings: PlaygroundAISuggestionsSettings,
): Editor {
	const model = createPlaygroundAIModel(() => editorRef.current);
	const collaborationExtension = createPlaygroundCollaborationExtension();
	const extensions = [
		aiExtension({
			model,
			contentFormat: PLAYGROUND_AI_CONTENT_FORMAT,
		}),
		aiSuggestionsExtension({
			mode: "balanced",
			analyzer: createPlaygroundAISuggestionsAnalyzer(),
			enabled: aiSuggestionsSettings.enabled,
			debounceMs: aiSuggestionsSettings.debounceMs,
			minChangedChars: aiSuggestionsSettings.minChangedChars,
			minStableMs: aiSuggestionsSettings.minStableMs,
			cooldownMs: aiSuggestionsSettings.cooldownMs,
			maxScopeChars: aiSuggestionsSettings.maxScopeChars,
			maxSuggestionsPerScope:
				aiSuggestionsSettings.maxSuggestionsPerScope,
			minConfidence: aiSuggestionsSettings.minConfidence,
		}),
		autocompleteExtension({
			model,
			enabled: autocompleteSettings.enabled,
			debounceMs: autocompleteSettings.debounceMs,
			prefetchAfterAccept: autocompleteSettings.prefetchAfterAccept,
			acceptanceStrategy: autocompleteSettings.acceptanceStrategy,
			staleAfterMs: PLAYGROUND_AI_AUTOCOMPLETE_STALE_AFTER_MS,
			blockPolicy: autocompleteSettings.blockPolicy,
		}),
		searchExtension(),
		inputRulesExtension(),
		databaseExtension(),
		collaborationExtension,
	];

	return createEditor({
		documentProfile: PLAYGROUND_DOCUMENT_PROFILE,
		preset: defaultPreset({
			deltaStream: {
				batchInterval: PLAYGROUND_AI_DIRECT_STREAM_BATCH_INTERVAL_MS,
			},
			shortcuts: {
				onToggleLink: (ed) => {
					if (!canOpenLinkEditor(ed)) return false;
					linkToggleRef.current?.();
					return true;
				},
			},
		}),
		extensions,
	});
}
