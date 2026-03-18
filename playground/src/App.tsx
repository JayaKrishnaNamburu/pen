import {
	Pen,
	useMultiplayer,
	type RendererOverrides,
} from "@pen/react";
import { aiExtension } from "@pen/ai";
import {
	type AISuggestionsExtensionConfig,
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
import { getMultiplayerController } from "@pen/multiplayer";
import { searchExtension } from "@pen/search";
import type { Editor, InteractionModel } from "@pen/types";
import { inputRulesExtension } from "@pen/input-rules";
import { defaultPreset } from "@pen/preset-default";
import { databaseExtension, databaseRenderers } from "@pen/database";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import "./App.css";
import { PlaygroundBlockDragHandle } from "./components/BlockDragHandle";
import { CollaborationNameModal } from "./components/CollaborationNameModal";
import { PlaygroundImageRenderer } from "./components/ImageBlockRenderer";
import { PlaygroundChatDock } from "./components/PlaygroundChatDock";
import { PlaygroundEditorViewport } from "./components/PlaygroundEditorViewport";
import { usePlaygroundAISession } from "./hooks/usePlaygroundAISession";
import { InspectorPanel } from "./components/InspectorPanel";
import { Toolbar } from "./components/Toolbar";
import { PLAYGROUND_ASSETS, PLAYGROUND_IMPORTERS } from "./constants/playground";
import { PLAYGROUND_AI_DIRECT_STREAM_BATCH_INTERVAL_MS } from "./constants/playgroundAI";
import {
	attachPlaygroundAutocompleteLogging,
	logAutocompleteDebug,
	summarizeAutocompleteState,
} from "./utils/autocompleteDebug";
import { createPlaygroundAIModel } from "./utils/playgroundAI";
import { createPlaygroundAISuggestionsAnalyzer } from "./utils/playgroundAISuggestions";
import { installPlaygroundAISuggestionsDebug } from "./utils/playgroundAISuggestionsDebug";
import {
	createPlaygroundCollaborationExtension,
	getPlaygroundCollaborationConfig,
	getPlaygroundCollaborationRoom,
	getPlaygroundCollaborationUserName,
	normalizePlaygroundCollaborationDocument,
	savePlaygroundCollaborationUserName,
	startFreshPlaygroundCollaborationRoom,
} from "./utils/playgroundCollaboration";
import { canOpenLinkEditor } from "./utils/linkMarks";

const PLAYGROUND_RENDERERS = {
	...databaseRenderers,
	image: PlaygroundImageRenderer,
} satisfies RendererOverrides;
const PLAYGROUND_BLOCK_DRAG_AND_DROP = { enabled: true } as const;
const PLAYGROUND_DOCUMENT_PROFILE = "structured" as const;
const PLAYGROUND_AI_CONTENT_FORMAT = {
	blockGeneration: "markdown",
	selectionRewrite: "text",
} as const;
const PLAYGROUND_AI_AUTOCOMPLETE_DEBOUNCE_MS = 220;
const PLAYGROUND_AI_AUTOCOMPLETE_STALE_AFTER_MS = 5000;
const DEFAULT_PLAYGROUND_AUTOCOMPLETE_BLOCK_POLICY: AutocompleteBlockPolicy = {
	allowInCodeBlocks: true,
	allowInTables: false,
	deniedBlockTypes: ["database"],
};

type PlaygroundAutocompleteSettings = {
	enabled: boolean;
	debounceMs: number;
	prefetchAfterAccept: boolean;
	acceptanceStrategy: AutocompleteAcceptanceStrategy;
	blockPolicy: AutocompleteBlockPolicy;
};

type PlaygroundAISuggestionsSettings = Pick<
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

const DEFAULT_PLAYGROUND_AI_SUGGESTIONS_SETTINGS: PlaygroundAISuggestionsSettings =
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

export function App() {
	const editorRef = useRef<Editor | null>(null);
	const linkToggleRef = useRef<(() => void) | null>(null);
	const [collaborationName, setCollaborationName] = useState(() =>
		getPlaygroundCollaborationUserName(),
	);
	const [autocompleteSettings, setAutocompleteSettings] =
		useState<PlaygroundAutocompleteSettings>({
			enabled: true,
			debounceMs: PLAYGROUND_AI_AUTOCOMPLETE_DEBOUNCE_MS,
			prefetchAfterAccept: true,
			acceptanceStrategy: "full",
			blockPolicy: DEFAULT_PLAYGROUND_AUTOCOMPLETE_BLOCK_POLICY,
		});
	const [aiSuggestionsSettings, setAISuggestionsSettings] =
		useState<PlaygroundAISuggestionsSettings>(
			DEFAULT_PLAYGROUND_AI_SUGGESTIONS_SETTINGS,
		);
	const collaborationReady = collaborationName.trim().length > 0;
	const collaboration = collaborationReady
		? getPlaygroundCollaborationConfig()
		: null;
	const collaborationRoom = getPlaygroundCollaborationRoom();
	const editor = usePlaygroundEditor(
		editorRef,
		linkToggleRef,
		autocompleteSettings,
		aiSuggestionsSettings,
		collaborationReady,
	);
	usePlaygroundAISession(editor);
	const [isInspectorOpen, setIsInspectorOpen] = useState(false);
	const [interactionModel, setInteractionModel] = useState<InteractionModel>("content-first");
	const [customCaretEnabled, setCustomCaretEnabled] = useState(true);

	if (collaborationReady && !editor) {
		return null;
	}

	const handleToggleInspector = () => {
		setIsInspectorOpen((value) => !value);
	};
	const handleToggleInteractionModel = () => {
		setInteractionModel((current) =>
			current === "content-first" ? "block-first" : "content-first",
		);
	};
	const handleAutocompleteEnabledChange = (enabled: boolean) => {
		setAutocompleteSettings((current) => ({
			...current,
			enabled,
		}));
	};
	const handleCustomCaretEnabledChange = (enabled: boolean) => {
		setCustomCaretEnabled(enabled);
	};
	const handleAutocompletePrefetchChange = (prefetchAfterAccept: boolean) => {
		setAutocompleteSettings((current) => ({
			...current,
			prefetchAfterAccept,
		}));
	};
	const handleAutocompleteDebounceChange = (debounceMs: number) => {
		setAutocompleteSettings((current) => ({
			...current,
			debounceMs,
		}));
	};
	const handleAutocompleteAcceptanceStrategyChange = (
		acceptanceStrategy: AutocompleteAcceptanceStrategy,
	) => {
		setAutocompleteSettings((current) => ({
			...current,
			acceptanceStrategy,
		}));
	};
	const handleAutocompleteBlockPolicyChange = (
		blockPolicy: Partial<AutocompleteBlockPolicy>,
	) => {
		setAutocompleteSettings((current) => ({
			...current,
			blockPolicy: {
				...current.blockPolicy,
				...blockPolicy,
			},
		}));
	};
	const handleAISuggestionsEnabledChange = (enabled: boolean) => {
		setAISuggestionsSettings((current) => ({
			...current,
			enabled,
		}));
	};
	const handleAISuggestionsDebounceChange = (debounceMs: number) => {
		setAISuggestionsSettings((current) => ({
			...current,
			debounceMs,
		}));
	};
	const handleAISuggestionsMinChangedCharsChange = (
		minChangedChars: number,
	) => {
		setAISuggestionsSettings((current) => ({
			...current,
			minChangedChars,
		}));
	};
	const handleAISuggestionsMinStableMsChange = (minStableMs: number) => {
		setAISuggestionsSettings((current) => ({
			...current,
			minStableMs,
		}));
	};
	const handleAISuggestionsCooldownMsChange = (cooldownMs: number) => {
		setAISuggestionsSettings((current) => ({
			...current,
			cooldownMs,
		}));
	};
	const handleAISuggestionsMaxScopeCharsChange = (maxScopeChars: number) => {
		setAISuggestionsSettings((current) => ({
			...current,
			maxScopeChars,
		}));
	};
	const handleAISuggestionsMaxSuggestionsPerScopeChange = (
		maxSuggestionsPerScope: number,
	) => {
		setAISuggestionsSettings((current) => ({
			...current,
			maxSuggestionsPerScope,
		}));
	};
	const handleAISuggestionsMinConfidenceChange = (minConfidence: number) => {
		setAISuggestionsSettings((current) => ({
			...current,
			minConfidence,
		}));
	};
	const handleCollaborationNameSubmit = (name: string) => {
		const nextUser = savePlaygroundCollaborationUserName(name);
		setCollaborationName(nextUser.name);
	};
	const handleStartFreshRoom = () => {
		startFreshPlaygroundCollaborationRoom();
	};

	if (!collaborationReady) {
		return (
			<CollaborationNameModal
				defaultName={collaborationName}
				room={collaborationRoom}
				onSubmit={handleCollaborationNameSubmit}
			/>
		);
	}

	if (!editor || !collaboration) {
		return null;
	}

	const activeEditor = editor;
	const activeCollaboration = collaboration;

	return (
		<Pen.Editor.Root
			editor={activeEditor}
			importers={PLAYGROUND_IMPORTERS}
			assets={PLAYGROUND_ASSETS}
			renderers={PLAYGROUND_RENDERERS}
			blockControls={PlaygroundBlockDragHandle}
			blockDragAndDrop={PLAYGROUND_BLOCK_DRAG_AND_DROP}
			interactionModel={interactionModel}
		>
			<PlaygroundCollaborationBootstrap editor={activeEditor} />
			<Pen.AI.Root editor={activeEditor}>
				<div className="playground-shell">
					<div className="playground-editor-column">
						<Toolbar
							editor={activeEditor}
							linkToggleRef={linkToggleRef}
							collaboration={activeCollaboration}
							interactionModel={interactionModel}
							onToggleInteractionModel={handleToggleInteractionModel}
							onStartFreshRoom={handleStartFreshRoom}
						/>
						<PlaygroundEditorViewport
							editor={activeEditor}
							collaborationEnabled={true}
							customCaretEnabled={customCaretEnabled}
						/>
					</div>
					<div className="playground-side-panel">
						<PlaygroundChatDock
							editor={activeEditor}
							autocompleteEnabled={autocompleteSettings.enabled}
							customCaretEnabled={customCaretEnabled}
							onAutocompleteEnabledChange={handleAutocompleteEnabledChange}
							onCustomCaretEnabledChange={handleCustomCaretEnabledChange}
						/>
					</div>
					<InspectorPanel
						editor={activeEditor}
						isOpen={isInspectorOpen}
						onToggle={handleToggleInspector}
						autocompleteSettings={autocompleteSettings}
						aiSuggestionsSettings={aiSuggestionsSettings}
						customCaretEnabled={customCaretEnabled}
						onCustomCaretEnabledChange={handleCustomCaretEnabledChange}
						onAutocompleteEnabledChange={
							handleAutocompleteEnabledChange
						}
						onAutocompletePrefetchChange={
							handleAutocompletePrefetchChange
						}
						onAutocompleteDebounceChange={
							handleAutocompleteDebounceChange
						}
						onAutocompleteAcceptanceStrategyChange={
							handleAutocompleteAcceptanceStrategyChange
						}
						onAutocompleteBlockPolicyChange={handleAutocompleteBlockPolicyChange}
						onAISuggestionsEnabledChange={handleAISuggestionsEnabledChange}
						onAISuggestionsDebounceChange={handleAISuggestionsDebounceChange}
						onAISuggestionsMinChangedCharsChange={
							handleAISuggestionsMinChangedCharsChange
						}
						onAISuggestionsMinStableMsChange={
							handleAISuggestionsMinStableMsChange
						}
						onAISuggestionsCooldownMsChange={
							handleAISuggestionsCooldownMsChange
						}
						onAISuggestionsMaxScopeCharsChange={
							handleAISuggestionsMaxScopeCharsChange
						}
						onAISuggestionsMaxSuggestionsPerScopeChange={
							handleAISuggestionsMaxSuggestionsPerScopeChange
						}
						onAISuggestionsMinConfidenceChange={
							handleAISuggestionsMinConfidenceChange
						}
					/>
				</div>
			</Pen.AI.Root>
		</Pen.Editor.Root>
	);
}

function PlaygroundCollaborationBootstrap({ editor }: { editor: Editor }) {
	const multiplayerState = useMultiplayer(editor);

	useEffect(() => {
		if (multiplayerState.connectionState !== "connected") {
			return;
		}

		normalizePlaygroundCollaborationDocument(editor);
	}, [editor, multiplayerState.connectionState]);

	return null;
}

function usePlaygroundEditor(
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
			maxSuggestionsPerScope: aiSuggestionsSettings.maxSuggestionsPerScope,
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
			maxSuggestionsPerScope: aiSuggestionsSettings.maxSuggestionsPerScope,
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
