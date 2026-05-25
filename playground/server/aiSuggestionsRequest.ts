import { generateText } from "ai";
import type { ServerResponse } from "node:http";
import {
	AI_SUGGESTIONS_SYSTEM_PROMPT,
	parseSuggestionResponse,
} from "@pen/ai-suggestions";
import {
	PLAYGROUND_SELECTION_MODEL,
	createPlaygroundLanguageModel,
} from "./config";
import { sendJson } from "./http";
import { resolveUsageTokenValue } from "./requestPlan";
import type { AISuggestionRequestScope } from "./types";

export async function handleAISuggestionsRequest(
	res: ServerResponse,
	suggestionScope: AISuggestionRequestScope,
	abortSignal: AbortSignal,
): Promise<void> {
	const result = await generateText({
		model: createPlaygroundLanguageModel(PLAYGROUND_SELECTION_MODEL),
		system: AI_SUGGESTIONS_SYSTEM_PROMPT,
		prompt: JSON.stringify(
			{
				language: "en",
				blockType: suggestionScope.blockType,
				targetText: suggestionScope.targetText,
				contextBefore: suggestionScope.contextBefore,
				contextAfter: suggestionScope.contextAfter,
				rules: {
					maxSuggestions: 3,
					allowedKinds: [
						"spelling",
						"grammar",
						"rephrase",
						"clarity",
					],
				},
			},
			null,
			2,
		),
		temperature: 0,
		abortSignal,
	});
	sendJson(res, 200, {
		suggestions: parseSuggestionResponse(result.text),
		usage: {
			promptTokens: resolveUsageTokenValue(result.usage, "inputTokens"),
			completionTokens: resolveUsageTokenValue(
				result.usage,
				"outputTokens",
			),
		},
	});
}
