import "./DebugPanel.css";
import type { Editor } from "@pen/types";
import { useAIDebugLog } from "@pen/react";
import { PLAYGROUND_AI_SESSION_ID_PREVIEW_LENGTH } from "../constants/playgroundAI";
import { usePlaygroundAIState } from "../hooks/usePlaygroundAISession";

type DebugPanelProps = {
	editor: Editor;
	sessionId?: string;
	autocompleteEnabled?: boolean;
	customCaretEnabled?: boolean;
	onAutocompleteEnabledChange?: (enabled: boolean) => void;
	onCustomCaretEnabledChange?: (enabled: boolean) => void;
	variant?: "sidebar" | "dock";
};

export function DebugPanel({
	editor,
	sessionId,
	autocompleteEnabled = true,
	customCaretEnabled = false,
	onAutocompleteEnabledChange,
	onCustomCaretEnabledChange,
	variant = "sidebar",
}: DebugPanelProps) {
	const debugLog = useAIDebugLog(editor, { sessionId });
	const playgroundAIState = usePlaygroundAIState();

	const sessionLabel = playgroundAIState.sessionId
		? playgroundAIState.sessionId.slice(
			0,
			PLAYGROUND_AI_SESSION_ID_PREVIEW_LENGTH,
		)
		: "None";
	const syncLabel = formatMetricMs(playgroundAIState.lastSyncMs);
	const backendPhaseLabel = formatPhaseLabel(playgroundAIState.phase);
	const lastRequest = playgroundAIState.lastRequest;
	const requestModeLabel = formatRequestMode(lastRequest?.requestMode ?? null);
	const requestModelLabel = formatRequestModel(lastRequest?.requestModel ?? null);
	const contextFormatLabel = formatContextFormat(lastRequest?.contextFormat ?? null);
	const contextTokensLabel = formatContextTokens(
		lastRequest?.contextEstimatedTokensJson ?? null,
		lastRequest?.contextFormat ?? null,
	);
	const aggregateFastApply = debugLog.aggregateFastApply;
	const performanceMetricItems = [
		{
			label: "Mode",
			value: requestModeLabel,
		},
		{
			label: "Model",
			value: requestModelLabel,
		},
		{
			label: "Context format",
			value: contextFormatLabel,
		},
		{
			label: "Backend phase",
			value: backendPhaseLabel,
		},
		{
			label: "Session",
			value: sessionLabel,
		},
		{
			label: "Last sync",
			value: syncLabel,
		},
		{
			label: "First token",
			value: formatMetricMs(lastRequest?.firstTextDeltaBrowserMs ?? null),
		},
		{
			label: "Tool time",
			value: formatMetricMs(lastRequest?.toolExecutionMs ?? null),
		},
		{
			label: "Total",
			value: formatMetricMs(lastRequest?.totalBrowserMs ?? null),
		},
		{
			label: "Context tokens",
			value: contextTokensLabel,
		},
		{
			label: "Fast apply attempts",
			value: formatFastApplyMetricCount(aggregateFastApply.attemptCount),
		},
		{
			label: "Fast apply native",
			value: formatFastApplyMetricCount(aggregateFastApply.nativeFastApplyCount),
		},
		{
			label: "Fast apply scoped",
			value: formatFastApplyMetricCount(aggregateFastApply.scopedReplacementCount),
		},
		{
			label: "Fast apply plain",
			value: formatFastApplyMetricCount(aggregateFastApply.plainMarkdownCount),
		},
		{
			label: "Fast apply failed",
			value: formatFastApplyMetricCount(aggregateFastApply.failedCount),
		},
	];
	const performanceMetricRows = performanceMetricItems.map((item) => (
		<div className="playground-debug-metric" key={item.label}>
			<span className="playground-debug-metric-label">{item.label}</span>
			<span className="playground-debug-metric-value">{item.value}</span>
		</div>
	));
	const debugControlRows = [];
	if (onAutocompleteEnabledChange) {
		debugControlRows.push(
			<label className="playground-debug-toggle-row" key="autocomplete">
				<span>Autocomplete</span>
				<input
					type="checkbox"
					checked={autocompleteEnabled}
					onChange={(event) =>
						onAutocompleteEnabledChange(event.target.checked)
					}
				/>
			</label>,
		);
	}
	if (onCustomCaretEnabledChange) {
		debugControlRows.push(
			<label className="playground-debug-toggle-row" key="custom-caret">
				<span>Custom caret</span>
				<input
					type="checkbox"
					checked={customCaretEnabled}
					onChange={(event) =>
						onCustomCaretEnabledChange(event.target.checked)
					}
				/>
			</label>,
		);
	}

	return (
		<div
			className="playground-debug-shell"
			data-pen-ignore-pointer-gesture=""
			data-variant={variant}
		>
			<div className="playground-debug-panel">
				{debugControlRows.length > 0 ? (
					<div className="playground-debug-section">
						<div className="playground-debug-section-header">
							<h4>Controls</h4>
						</div>
						<div className="playground-debug-controls">
							{debugControlRows}
						</div>
					</div>
				) : null}
				<div className="playground-debug-section">
					<div className="playground-debug-section-header">
						<h4>Debug</h4>
					</div>
					<div className="playground-debug-summary">{performanceMetricRows}</div>
				</div>
			</div>
		</div>
	);
}

function formatMetricMs(value: number | null): string {
	if (value == null || !Number.isFinite(value)) {
		return "Pending";
	}

	return `${Math.round(value)}ms`;
}

function formatPhaseLabel(value: string): string {
	switch (value) {
		case "tool-calling":
			return "Tool calling";
		case "creating-session":
			return "Starting session";
		case "syncing":
			return "Syncing";
		case "complete":
			return "Complete";
		case "error":
			return "Error";
		case "idle":
			return "Idle";
		default:
			return value.charAt(0).toUpperCase() + value.slice(1);
	}
}

function formatContextTokens(
	jsonTokens: number | null,
	contextFormat: string | null,
): string {
	if (contextFormat === "none") {
		return "Bypassed";
	}

	if (jsonTokens == null || !Number.isFinite(jsonTokens) || jsonTokens <= 0) {
		return "Pending";
	}

	return `${jsonTokens}`;
}

function formatRequestMode(value: string | null): string {
	if (value === "selection-fast") {
		return "Selection fast path";
	}

	if (value === "document-agent") {
		return "Document agent";
	}

	if (value === "structured-generation") {
		return "Structured generation";
	}

	if (value === "inline-autocomplete") {
		return "Inline autocomplete";
	}

	return "Pending";
}

function formatRequestModel(value: string | null): string {
	if (!value) {
		return "Pending";
	}

	return value;
}

function formatContextFormat(value: string | null): string {
	if (value === "json") {
		return "JSON";
	}

	if (value === "none") {
		return "Bypassed";
	}

	return "Pending";
}

function formatFastApplyMetricCount(value: number | null): string {
	if (value == null || !Number.isFinite(value)) {
		return "Pending";
	}

	return `${value}`;
}
