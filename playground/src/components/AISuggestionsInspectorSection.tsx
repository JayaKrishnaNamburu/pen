import type { Editor } from "@pen/types";
import { usePlaygroundAISuggestions } from "../hooks/usePlaygroundAISuggestions";
import { formatConfidence } from "./InspectorPanelUtils";

type AISuggestionsInspectorSectionProps = {
	editor: Editor;
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

export function AISuggestionsInspectorSection({
	editor,
	aiSuggestionsSettings,
	onAISuggestionsEnabledChange,
	onAISuggestionsDebounceChange,
	onAISuggestionsMinChangedCharsChange,
	onAISuggestionsMinStableMsChange,
	onAISuggestionsCooldownMsChange,
	onAISuggestionsMaxScopeCharsChange,
	onAISuggestionsMaxSuggestionsPerScopeChange,
	onAISuggestionsMinConfidenceChange,
}: AISuggestionsInspectorSectionProps) {
	const aiSuggestions = usePlaygroundAISuggestions(editor);
	const activeSuggestionGroup =
		aiSuggestions.state.groups.find(
			(group) => group.id === aiSuggestions.state.activeSuggestionGroupId,
		) ?? null;
	const aiSuggestionMetricItems = [
		{
			label: "Status",
			value: aiSuggestions.state.status,
		},
		{
			label: "Visible suggestions",
			value: `${aiSuggestions.state.suggestions.length}`,
		},
		{
			label: "Groups",
			value: `${aiSuggestions.state.groups.length}`,
		},
		{
			label: "Active suggestion",
			value: aiSuggestions.state.activeSuggestionId ?? "None",
		},
		{
			label: "Active group",
			value: activeSuggestionGroup?.title ?? "None",
		},
		{
			label: "Request",
			value: aiSuggestions.state.activeRequestId ?? "None",
		},
		{
			label: "Requests",
			value: `${aiSuggestions.state.metrics.requestCount}`,
		},
		{
			label: "Successes",
			value: `${aiSuggestions.state.metrics.successCount}`,
		},
		{
			label: "Cancels",
			value: `${aiSuggestions.state.metrics.cancelCount}`,
		},
		{
			label: "Errors",
			value: `${aiSuggestions.state.metrics.errorCount}`,
		},
		{
			label: "Cache hits",
			value: `${aiSuggestions.state.metrics.cacheHitCount}`,
		},
		{
			label: "Applied",
			value: `${aiSuggestions.state.metrics.suggestionAppliedCount}`,
		},
		{
			label: "Dismissed",
			value: `${aiSuggestions.state.metrics.suggestionDismissedCount}`,
		},
		{
			label: "Tokens",
			value: `${aiSuggestions.state.metrics.promptTokens}/${aiSuggestions.state.metrics.completionTokens}`,
		},
	];
	const aiSuggestionMetricRows = aiSuggestionMetricItems.map((item) => (
		<div className="inspector-metric" key={`ai-suggestions:${item.label}`}>
			<span className="inspector-metric-label">{item.label}</span>
			<span className="inspector-metric-value">{item.value}</span>
		</div>
	));
	const aiSuggestionActionItems = [
		{
			label: "Trigger now",
			onClick: () => {
				aiSuggestions.controller?.request({ force: true });
			},
			disabled:
				!aiSuggestions.controller ||
				aiSuggestions.settings.enabled === false,
		},
		{
			label: "Apply active",
			onClick: () => {
				const groupId = aiSuggestions.state.activeSuggestionGroupId;
				if (groupId) {
					aiSuggestions.controller?.applySuggestionGroup(groupId);
					return;
				}
				const suggestionId = aiSuggestions.state.activeSuggestionId;
				if (suggestionId) {
					aiSuggestions.controller?.applySuggestion(suggestionId);
				}
			},
			disabled:
				!aiSuggestions.controller ||
				(aiSuggestions.state.activeSuggestionGroupId == null &&
					aiSuggestions.state.activeSuggestionId == null),
		},
		{
			label: "Dismiss active",
			onClick: () => {
				const groupId = aiSuggestions.state.activeSuggestionGroupId;
				if (groupId) {
					aiSuggestions.controller?.dismissSuggestionGroup(groupId);
					return;
				}
				const suggestionId = aiSuggestions.state.activeSuggestionId;
				if (suggestionId) {
					aiSuggestions.controller?.dismissSuggestion(suggestionId);
				}
			},
			disabled:
				!aiSuggestions.controller ||
				(aiSuggestions.state.activeSuggestionGroupId == null &&
					aiSuggestions.state.activeSuggestionId == null),
		},
		{
			label: "Clear invalid",
			onClick: () => {
				aiSuggestions.controller?.clearInvalidSuggestions();
			},
			disabled: !aiSuggestions.controller,
		},
	];
	const aiSuggestionActionButtons = aiSuggestionActionItems.map((action) => (
		<button
			className="inspector-action-button"
			type="button"
			key={action.label}
			onClick={action.onClick}
			disabled={action.disabled}
		>
			{action.label}
		</button>
	));
	return (
		<section className="inspector-section">
			<div className="inspector-section-header">
				<h5 className="inspector-section-title">AI suggestions</h5>
			</div>
			<div className="inspector-controls">
				<label className="inspector-toggle-row">
					<span>Enabled</span>
					<input
						type="checkbox"
						checked={aiSuggestionsSettings.enabled ?? true}
						onChange={(event) =>
							onAISuggestionsEnabledChange(event.target.checked)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Debounce
						<strong>{` ${aiSuggestionsSettings.debounceMs ?? 0}ms`}</strong>
					</span>
					<input
						type="range"
						min={0}
						max={3000}
						step={100}
						value={aiSuggestionsSettings.debounceMs ?? 0}
						onChange={(event) =>
							onAISuggestionsDebounceChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Min changed chars
						<strong>{` ${aiSuggestionsSettings.minChangedChars ?? 0}`}</strong>
					</span>
					<input
						type="range"
						min={1}
						max={50}
						step={1}
						value={aiSuggestionsSettings.minChangedChars ?? 1}
						onChange={(event) =>
							onAISuggestionsMinChangedCharsChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Min stable time
						<strong>{` ${aiSuggestionsSettings.minStableMs ?? 0}ms`}</strong>
					</span>
					<input
						type="range"
						min={0}
						max={3000}
						step={100}
						value={aiSuggestionsSettings.minStableMs ?? 0}
						onChange={(event) =>
							onAISuggestionsMinStableMsChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Cooldown
						<strong>{` ${aiSuggestionsSettings.cooldownMs ?? 0}ms`}</strong>
					</span>
					<input
						type="range"
						min={0}
						max={30000}
						step={500}
						value={aiSuggestionsSettings.cooldownMs ?? 0}
						onChange={(event) =>
							onAISuggestionsCooldownMsChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Max scope chars
						<strong>{` ${aiSuggestionsSettings.maxScopeChars ?? 0}`}</strong>
					</span>
					<input
						type="range"
						min={80}
						max={600}
						step={20}
						value={aiSuggestionsSettings.maxScopeChars ?? 80}
						onChange={(event) =>
							onAISuggestionsMaxScopeCharsChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Max suggestions per scope
						<strong>{` ${aiSuggestionsSettings.maxSuggestionsPerScope ?? 0}`}</strong>
					</span>
					<input
						type="range"
						min={1}
						max={6}
						step={1}
						value={
							aiSuggestionsSettings.maxSuggestionsPerScope ?? 1
						}
						onChange={(event) =>
							onAISuggestionsMaxSuggestionsPerScopeChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
				<label className="inspector-range-row">
					<span>
						Min confidence
						<strong>{` ${formatConfidence(aiSuggestionsSettings.minConfidence ?? 0)}`}</strong>
					</span>
					<input
						type="range"
						min={0.5}
						max={1}
						step={0.01}
						value={aiSuggestionsSettings.minConfidence ?? 0.5}
						onChange={(event) =>
							onAISuggestionsMinConfidenceChange(
								Number(event.target.value),
							)
						}
					/>
				</label>
			</div>
			<div className="inspector-action-row">
				{aiSuggestionActionButtons}
			</div>
			<div className="inspector-metrics">{aiSuggestionMetricRows}</div>
		</section>
	);
}
