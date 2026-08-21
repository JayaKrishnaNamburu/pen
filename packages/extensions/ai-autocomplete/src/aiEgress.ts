import type {
	AIDocumentExcerpt,
	AIRequestContext,
	ModelMessage,
} from "@input/pen-types";
import type { AutocompleteRequestContext } from "./providers/types";

export { streamThroughEgress } from "@input/pen-core";

export function excerptsFromAutocompleteContext(
	context: AutocompleteRequestContext,
): AIDocumentExcerpt[] {
	const excerpts: AIDocumentExcerpt[] = [
		{
			blockId: context.blockId,
			kind: "target",
			text: `${context.prefixText}${context.suffixText}`,
		},
	];
	const block = context.editor.getBlock(context.blockId);
	if (block?.prev && context.previousBlockText.length > 0) {
		excerpts.push({
			blockId: block.prev.id,
			kind: "context",
			text: context.previousBlockText,
		});
	}
	if (block?.next && context.nextBlockText.length > 0) {
		excerpts.push({
			blockId: block.next.id,
			kind: "context",
			text: context.nextBlockText,
		});
	}
	return excerpts;
}

export function buildAutocompleteAIRequest(
	context: AutocompleteRequestContext,
	messages: readonly ModelMessage[],
): AIRequestContext {
	return {
		feature: "autocomplete",
		messages,
		documentExcerpts: excerptsFromAutocompleteContext(context),
		tools: [],
	};
}
