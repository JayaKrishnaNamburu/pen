import type {
	AIDocumentExcerpt,
	AIRequestContext,
	ModelMessage,
} from "@input/pen-types";
import type { BuiltSuggestionScope } from "./scopeBuilder";

export { streamThroughEgress } from "@input/pen-core";

export function excerptsFromSuggestionScope(
	scope: BuiltSuggestionScope,
): AIDocumentExcerpt[] {
	const excerpts: AIDocumentExcerpt[] = [
		{
			blockId: scope.scope.blockId,
			kind: "target",
			text: scope.scope.text,
		},
	];
	if (scope.contextBefore.length > 0) {
		excerpts.push({
			blockId: scope.scope.blockId,
			kind: "context",
			text: scope.contextBefore,
		});
	}
	if (scope.contextAfter.length > 0) {
		excerpts.push({
			blockId: scope.scope.blockId,
			kind: "context",
			text: scope.contextAfter,
		});
	}
	return excerpts;
}

export function buildSuggestionsAIRequest(
	scope: BuiltSuggestionScope,
	messages: readonly ModelMessage[],
): AIRequestContext {
	return {
		feature: "suggestions",
		messages,
		documentExcerpts: excerptsFromSuggestionScope(scope),
		tools: [],
	};
}
