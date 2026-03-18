import type { ModelMessage } from "@pen/types";
import { DEFAULT_MAX_SUGGESTIONS_PER_SCOPE } from "./constants";
import type { AISuggestionsExtensionConfig } from "./types";
import type { BuiltSuggestionScope } from "./scopeBuilder";

export const AI_SUGGESTIONS_SYSTEM_PROMPT = [
	"You are a precision writing assistant for an editor.",
	"Return only valid JSON.",
	"You may only suggest edits inside TARGET_TEXT.",
	"Do not rewrite surrounding context.",
	"Prefer high-confidence spelling, grammar, and concise clarity fixes.",
	"Return an empty suggestions array when no high-value fix exists.",
	"Every suggestion must include kind, title, originalText, replacementText, optional reason, and optional confidence.",
].join("\n");

export function buildAISuggestionMessages(
	input: BuiltSuggestionScope,
	config: AISuggestionsExtensionConfig = {},
): ModelMessage[] {
	const maxSuggestions =
		config.maxSuggestionsPerScope ?? DEFAULT_MAX_SUGGESTIONS_PER_SCOPE;

	return [
		{
			role: "system",
			content: AI_SUGGESTIONS_SYSTEM_PROMPT,
		},
		{
			role: "user",
			content: JSON.stringify(
				{
					language: "en",
					blockType: input.scope.blockType,
					targetText: input.scope.text,
					contextBefore: input.contextBefore,
					contextAfter: input.contextAfter,
					rules: {
						maxSuggestions,
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
		},
	];
}
