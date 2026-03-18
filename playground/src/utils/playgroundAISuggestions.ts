import {
	AI_SUGGESTIONS_REQUEST_MODE,
	type AISuggestionsAnalyzer,
	type AISuggestionsAnalyzerResult,
	type AISuggestionScope,
} from "@pen/ai-suggestions";
import type { Editor } from "@pen/types";
import { PLAYGROUND_AI_ENDPOINT } from "../constants/playgroundAI";
import {
	ensurePlaygroundAISession,
	flushPlaygroundAISessionSync,
} from "./playgroundAISession";

interface PlaygroundAISuggestionsResponse {
	suggestions?: unknown;
	usage?: {
		promptTokens?: unknown;
		completionTokens?: unknown;
	};
	error?: unknown;
}

export function createPlaygroundAISuggestionsAnalyzer(): AISuggestionsAnalyzer {
	return {
		async analyze(input: {
			editor: Editor;
			scope: AISuggestionScope;
			contextBefore: string;
			contextAfter: string;
			signal?: AbortSignal;
		}) {
			return requestPlaygroundAISuggestions(input.editor, {
				scope: input.scope,
				contextBefore: input.contextBefore,
				contextAfter: input.contextAfter,
				signal: input.signal,
			});
		},
	};
}

async function requestPlaygroundAISuggestions(
	editor: Editor,
	input: {
		scope: AISuggestionScope;
		contextBefore: string;
		contextAfter: string;
		signal?: AbortSignal;
	},
): Promise<AISuggestionsAnalyzerResult> {
	const sessionId = await ensurePlaygroundAISession(input.signal);
	await flushPlaygroundAISessionSync(editor, "request", input.signal);

	const response = await fetch(PLAYGROUND_AI_ENDPOINT, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			sessionId,
			requestMode: AI_SUGGESTIONS_REQUEST_MODE,
			suggestionScope: {
				blockType: input.scope.blockType,
				targetText: input.scope.text,
				contextBefore: input.contextBefore,
				contextAfter: input.contextAfter,
			},
		}),
		signal: input.signal,
	});

	if (!response.ok) {
		throw new Error(`AI suggestions request failed with ${response.status}.`);
	}

	const payload = (await response.json()) as PlaygroundAISuggestionsResponse;
	if (typeof payload.error === "string" && payload.error) {
		throw new Error(payload.error);
	}

	return {
		candidates: Array.isArray(payload.suggestions) ? payload.suggestions : [],
		usage: {
			promptTokens:
				typeof payload.usage?.promptTokens === "number"
					? payload.usage.promptTokens
					: 0,
			completionTokens:
				typeof payload.usage?.completionTokens === "number"
					? payload.usage.completionTokens
					: 0,
		},
	};
}
