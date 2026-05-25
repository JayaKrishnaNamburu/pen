import { Pen, type RendererOverrides } from "@pen/react";
import type {
	AutocompleteAcceptanceStrategy,
	AutocompleteBlockPolicy,
} from "@pen/ai-autocomplete";
import { databaseRenderers } from "@pen/database";
import type { Editor, InteractionModel } from "@pen/types";
import { useRef, useState } from "react";
import "./App.css";
import { PlaygroundBlockDragHandle } from "./components/BlockDragHandle";
import { CollaborationNameModal } from "./components/CollaborationNameModal";
import { PlaygroundImageRenderer } from "./components/ImageBlockRenderer";
import { InspectorPanel } from "./components/InspectorPanel";
import { PlaygroundChatDock } from "./components/PlaygroundChatDock";
import { PlaygroundEditorViewport } from "./components/PlaygroundEditorViewport";
import { Toolbar } from "./components/Toolbar";
import {
	PLAYGROUND_ASSETS,
	PLAYGROUND_IMPORTERS,
} from "./constants/playground";
import { usePlaygroundAISession } from "./hooks/usePlaygroundAISession";
import {
	DEFAULT_PLAYGROUND_AI_SUGGESTIONS_SETTINGS,
	DEFAULT_PLAYGROUND_AUTOCOMPLETE_BLOCK_POLICY,
	PLAYGROUND_AI_AUTOCOMPLETE_DEBOUNCE_MS,
	PlaygroundCollaborationBootstrap,
	type PlaygroundAISuggestionsSettings,
	type PlaygroundAutocompleteSettings,
	usePlaygroundEditor,
} from "./hooks/usePlaygroundEditor";
import {
	getPlaygroundCollaborationConfig,
	getPlaygroundCollaborationRoom,
	getPlaygroundCollaborationUserName,
	savePlaygroundCollaborationUserName,
	startFreshPlaygroundCollaborationRoom,
} from "./utils/playgroundCollaboration";

const PLAYGROUND_RENDERERS = {
	...databaseRenderers,
	image: PlaygroundImageRenderer,
} satisfies RendererOverrides;
const PLAYGROUND_BLOCK_DRAG_AND_DROP = { enabled: true } as const;

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
	const [interactionModel, setInteractionModel] =
		useState<InteractionModel>("content-first");
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
							onToggleInteractionModel={
								handleToggleInteractionModel
							}
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
							onAutocompleteEnabledChange={
								handleAutocompleteEnabledChange
							}
							onCustomCaretEnabledChange={
								handleCustomCaretEnabledChange
							}
						/>
					</div>
					<InspectorPanel
						editor={activeEditor}
						isOpen={isInspectorOpen}
						onToggle={handleToggleInspector}
						autocompleteSettings={autocompleteSettings}
						aiSuggestionsSettings={aiSuggestionsSettings}
						customCaretEnabled={customCaretEnabled}
						onCustomCaretEnabledChange={
							handleCustomCaretEnabledChange
						}
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
						onAutocompleteBlockPolicyChange={
							handleAutocompleteBlockPolicyChange
						}
						onAISuggestionsEnabledChange={
							handleAISuggestionsEnabledChange
						}
						onAISuggestionsDebounceChange={
							handleAISuggestionsDebounceChange
						}
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
