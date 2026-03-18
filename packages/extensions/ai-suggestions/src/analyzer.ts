import type { ModelMessage } from "@pen/types";
import { AI_SUGGESTIONS_REQUEST_MODE } from "./constants";
import { buildAISuggestionMessages } from "./promptBuilder";
import type { BuiltSuggestionScope } from "./scopeBuilder";
import type {
	AISuggestionCandidate,
	AISuggestionsAnalyzer,
	AISuggestionsAnalyzerResult,
	AISuggestionsExtensionConfig,
} from "./types";

export interface AnalyzeSuggestionScopeResult {
	candidates: readonly AISuggestionCandidate[];
	usage: {
		promptTokens: number;
		completionTokens: number;
	};
}

export async function analyzeSuggestionScope(input: {
	editor: import("@pen/types").Editor;
	scope: BuiltSuggestionScope;
	config: AISuggestionsExtensionConfig;
	signal?: AbortSignal;
}): Promise<AnalyzeSuggestionScopeResult> {
	const { editor, scope, config, signal } = input;

	if (config.analyzer) {
		return analyzeWithCustomAnalyzer(config.analyzer, editor, scope, signal);
	}

	if (!config.model) {
		return {
			candidates: [],
			usage: {
				promptTokens: 0,
				completionTokens: 0,
			},
		};
	}

	const messages = buildAISuggestionMessages(scope, config);
	let text = "";
	let promptTokens = 0;
	let completionTokens = 0;

	for await (const event of config.model.stream({
		messages,
		tools: [],
		signal,
		requestMode: AI_SUGGESTIONS_REQUEST_MODE,
	})) {
		if (event.type === "text-delta") {
			text += event.delta;
			continue;
		}

		if (event.type === "done") {
			promptTokens = event.usage?.promptTokens ?? 0;
			completionTokens = event.usage?.completionTokens ?? 0;
			break;
		}

		if (event.type === "error") {
			throw event.error instanceof Error
				? event.error
				: new Error("AI suggestions request failed.");
		}
	}

	return {
		candidates: parseSuggestionResponse(text),
		usage: {
			promptTokens,
			completionTokens,
		},
	};
}

async function analyzeWithCustomAnalyzer(
	analyzer: AISuggestionsAnalyzer,
	editor: import("@pen/types").Editor,
	scope: BuiltSuggestionScope,
	signal?: AbortSignal,
): Promise<AnalyzeSuggestionScopeResult> {
	const result = await analyzer.analyze({
		editor,
		scope: scope.scope,
		contextBefore: scope.contextBefore,
		contextAfter: scope.contextAfter,
		signal,
	});
	const normalized = normalizeAnalyzerResult(result);

	return {
		candidates: sanitizeCandidates(normalized.candidates),
		usage: {
			promptTokens: normalized.usage?.promptTokens ?? 0,
			completionTokens: normalized.usage?.completionTokens ?? 0,
		},
	};
}

function normalizeAnalyzerResult(
	result: AISuggestionsAnalyzerResult,
): AISuggestionsAnalyzerResult {
	return {
		candidates: result.candidates ?? [],
		usage: result.usage,
	};
}

export function parseSuggestionResponse(
	responseText: string,
): readonly AISuggestionCandidate[] {
	const normalized = unwrapJsonFence(responseText).trim();
	if (!normalized) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(normalized);
	} catch {
		return [];
	}

	if (!parsed || typeof parsed !== "object") {
		return [];
	}

	const suggestions = (parsed as { suggestions?: unknown }).suggestions;
	if (!Array.isArray(suggestions)) {
		return [];
	}

	return sanitizeCandidates(suggestions);
}

function sanitizeCandidates(
	input: readonly unknown[],
): readonly AISuggestionCandidate[] {
	const candidates: AISuggestionCandidate[] = [];

	for (const item of input) {
		if (!item || typeof item !== "object") {
			continue;
		}

		const record = item as Record<string, unknown>;
		const kind = record.kind;
		const title = record.title;
		const originalText = record.originalText;
		const replacementText = record.replacementText;
		const reason = record.reason;
		const confidence = record.confidence;

		const normalizedTitle = typeof title === "string" ? title.trim() : "";
		const normalizedOriginalText =
			typeof originalText === "string" ? originalText.trim() : "";
		const normalizedReplacementText =
			typeof replacementText === "string" ? replacementText.trim() : "";

		if (
			(kind !== "spelling" &&
				kind !== "grammar" &&
				kind !== "rephrase" &&
				kind !== "clarity") ||
			normalizedTitle.length === 0 ||
			normalizedOriginalText.length === 0 ||
			normalizedReplacementText.length === 0
		) {
			continue;
		}

		if (
			normalizeComparableText(normalizedOriginalText) ===
			normalizeComparableText(normalizedReplacementText)
		) {
			continue;
		}

		candidates.push({
			kind,
			title: normalizedTitle,
			originalText: normalizedOriginalText,
			replacementText: normalizedReplacementText,
			reason: typeof reason === "string" ? reason.trim() || undefined : undefined,
			confidence:
				typeof confidence === "number" && Number.isFinite(confidence)
					? Math.max(0, Math.min(1, confidence))
					: undefined,
		});
	}

	return candidates;
}

function unwrapJsonFence(value: string): string {
	return value
		.replace(/^```json\s*/i, "")
		.replace(/^```\s*/i, "")
		.replace(/\s*```$/, "");
}

function normalizeComparableText(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}
