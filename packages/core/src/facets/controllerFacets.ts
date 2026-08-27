import { defineFacet } from "./defineFacet";

export function singleController<T>(name: string) {
	return defineFacet<T, T | null>({
		name,
		combine: (inputs) => inputs[0] ?? null,
	});
}

export const fieldEditorHostFacet = singleController<unknown>(
	"pen.fieldEditorHost",
);
export const inputRulesEngineFacet = singleController<unknown>(
	"pen.inputRulesEngine",
);
export const undoRestoreControllerFacet = singleController<unknown>(
	"undo.restoreController",
);
export const undoMetadataControllerFacet = singleController<unknown>(
	"undo.metadataController",
);
export const undoManagerFacet = singleController<unknown>("undo.manager");
export const aiInlineCompletionFacet = singleController<unknown>(
	"ai.inlineCompletion",
);
export const aiControllerFacet = singleController<unknown>("ai.controller");
export const aiInlineHistoryFacet =
	singleController<unknown>("ai.inlineHistory");
export const aiReviewControllerFacet = singleController<unknown>(
	"ai.reviewController",
);
export const aiAutocompleteControllerFacet = singleController<unknown>(
	"ai.autocompleteController",
);
export const aiSuggestionsControllerFacet = singleController<unknown>(
	"ai.suggestionsController",
);
export const searchControllerFacet =
	singleController<unknown>("search.controller");
export const multiplayerControllerFacet = singleController<unknown>(
	"multiplayer.controller",
);
export const snapshotsControllerFacet =
	singleController<unknown>("history.controller");
export const assetProviderFacet =
	singleController<unknown>("pen.assetProvider");
export const toolRuntimeFacet = singleController<unknown>(
	"tools.toolRuntime",
);
export const announcerFacet = singleController<unknown>("pen.announcer");
export const streamingTargetFacet =
	singleController<unknown>("deltaStream.target");
