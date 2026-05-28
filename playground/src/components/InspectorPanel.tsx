import "./InspectorPanel.css";
import type {
	AutocompleteAcceptanceStrategy,
	AutocompleteBlockPolicy,
} from "@pen/ai-autocomplete";
import type { Editor } from "@pen/types";
import { useEditorInspector } from "../hooks/useEditorInspector";
import { AISuggestionsInspectorSection } from "./AISuggestionsInspectorSection";
import { AutocompleteInspectorSection } from "./AutocompleteInspectorSection";
import { IconConsole } from "./icons";

type InspectorPanelProps = {
	editor: Editor;
	isOpen: boolean;
	onToggle: () => void;
	autocompleteSettings: {
		enabled: boolean;
		debounceMs: number;
		prefetchAfterAccept: boolean;
		acceptanceStrategy: AutocompleteAcceptanceStrategy;
		blockPolicy: AutocompleteBlockPolicy;
	};
	aiSuggestionsSettings: {
		enabled?: boolean;
		debounceMs?: number;
		minChangedChars?: number;
		minStableMs?: number;
		cooldownMs?: number;
		maxScopeChars?: number;
		maxSuggestionsPerScope?: number;
		minConfidence?: number;
	};
	customCaretEnabled: boolean;
	onCustomCaretEnabledChange: (enabled: boolean) => void;
	onAutocompleteEnabledChange: (enabled: boolean) => void;
	onAutocompletePrefetchChange: (enabled: boolean) => void;
	onAutocompleteDebounceChange: (debounceMs: number) => void;
	onAutocompleteAcceptanceStrategyChange: (
		acceptanceStrategy: AutocompleteAcceptanceStrategy,
	) => void;
	onAutocompleteBlockPolicyChange: (
		blockPolicy: Partial<AutocompleteBlockPolicy>,
	) => void;
	onAISuggestionsEnabledChange: (enabled: boolean) => void;
	onAISuggestionsDebounceChange: (debounceMs: number) => void;
	onAISuggestionsMinChangedCharsChange: (minChangedChars: number) => void;
	onAISuggestionsMinStableMsChange: (minStableMs: number) => void;
	onAISuggestionsCooldownMsChange: (cooldownMs: number) => void;
	onAISuggestionsMaxScopeCharsChange: (maxScopeChars: number) => void;
	onAISuggestionsMaxSuggestionsPerScopeChange: (
		maxSuggestionsPerScope: number,
	) => void;
	onAISuggestionsMinConfidenceChange: (minConfidence: number) => void;
};

export function InspectorPanel({
	editor,
	isOpen,
	onToggle,
	autocompleteSettings,
	aiSuggestionsSettings,
	customCaretEnabled,
	onCustomCaretEnabledChange,
	onAutocompleteEnabledChange,
	onAutocompletePrefetchChange,
	onAutocompleteDebounceChange,
	onAutocompleteAcceptanceStrategyChange,
	onAutocompleteBlockPolicyChange,
	onAISuggestionsEnabledChange,
	onAISuggestionsDebounceChange,
	onAISuggestionsMinChangedCharsChange,
	onAISuggestionsMinStableMsChange,
	onAISuggestionsCooldownMsChange,
	onAISuggestionsMaxScopeCharsChange,
	onAISuggestionsMaxSuggestionsPerScopeChange,
	onAISuggestionsMinConfidenceChange,
}: InspectorPanelProps) {
	const inspectorJson = useEditorInspector(editor);

	return (
		<aside className="playground-inspector" data-open={isOpen || undefined}>
			<header className="inspector-header">
				<h4 className="inspector-title">Document</h4>
			</header>

			<div className="inspector">
				<AutocompleteInspectorSection
					editor={editor}
					autocompleteSettings={autocompleteSettings}
					onAutocompleteEnabledChange={onAutocompleteEnabledChange}
					onAutocompletePrefetchChange={onAutocompletePrefetchChange}
					onAutocompleteDebounceChange={onAutocompleteDebounceChange}
					onAutocompleteAcceptanceStrategyChange={
						onAutocompleteAcceptanceStrategyChange
					}
					onAutocompleteBlockPolicyChange={
						onAutocompleteBlockPolicyChange
					}
				/>
				<AISuggestionsInspectorSection
					editor={editor}
					aiSuggestionsSettings={aiSuggestionsSettings}
					onAISuggestionsEnabledChange={onAISuggestionsEnabledChange}
					onAISuggestionsDebounceChange={
						onAISuggestionsDebounceChange
					}
					onAISuggestionsMinChangedCharsChange={
						onAISuggestionsMinChangedCharsChange
					}
					onAISuggestionsMinStableMsChange={
						onAISuggestionsMinStableMsChange
					}
					onAISuggestionsCooldownMsChange={
						onAISuggestionsCooldownMsChange
					}
					onAISuggestionsMaxScopeCharsChange={
						onAISuggestionsMaxScopeCharsChange
					}
					onAISuggestionsMaxSuggestionsPerScopeChange={
						onAISuggestionsMaxSuggestionsPerScopeChange
					}
					onAISuggestionsMinConfidenceChange={
						onAISuggestionsMinConfidenceChange
					}
				/>
				<section className="inspector-section">
					<div className="inspector-section-header">
						<h5 className="inspector-section-title">Caret</h5>
					</div>
					<div className="inspector-controls">
						<label className="inspector-toggle-row">
							<span>Custom caret</span>
							<input
								type="checkbox"
								checked={customCaretEnabled}
								onChange={(event) =>
									onCustomCaretEnabledChange(
										event.target.checked,
									)
								}
							/>
						</label>
					</div>
				</section>
				<pre className="inspector-json">{inspectorJson}</pre>
			</div>

			<div className="inspector-footer">
				<button
					className="inspector-toggle-button"
					type="button"
					onClick={onToggle}
					data-active={isOpen || undefined}
					title={
						isOpen
							? "Hide document inspector"
							: "Show document inspector"
					}
					aria-label={
						isOpen
							? "Hide document inspector"
							: "Show document inspector"
					}
				>
					<IconConsole className="inspector-toggle-icon" />
				</button>
			</div>
		</aside>
	);
}
