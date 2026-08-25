import type { InteractionModel, SelectAllBehavior } from "@input/pen-types";

export type EditorSelectAllBehavior = SelectAllBehavior;

export const DEFAULT_SELECT_ALL_BEHAVIOR: EditorSelectAllBehavior =
	"document-first";

export function resolveSelectAllBehavior(
	interactionModel: InteractionModel,
): EditorSelectAllBehavior {
	return interactionModel === "block-first"
		? "block-first"
		: DEFAULT_SELECT_ALL_BEHAVIOR;
}
