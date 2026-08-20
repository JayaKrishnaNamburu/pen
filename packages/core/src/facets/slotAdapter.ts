import {
	AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	COLLECT_KEY_BINDINGS_SLOT_KEY,
	FIELD_EDITOR_SLOT_KEY,
	INPUT_RULES_ENGINE_SLOT_KEY,
	UNDO_HISTORY_RESTORE_SLOT_KEY,
	UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
	INLINE_COMPLETION_SLOT,
	AI_CONTROLLER_SLOT,
	AI_INLINE_HISTORY_SLOT,
	AI_REVIEW_CONTROLLER_SLOT,
	AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	AI_SUGGESTIONS_CONTROLLER_SLOT,
	SEARCH_CONTROLLER_SLOT,
	MULTIPLAYER_CONTROLLER_SLOT,
	HISTORY_CONTROLLER_SLOT,
	ANNOUNCER_SLOT_KEY,
	type Facet,
} from "@input/pen-types";

import { clipboardFacet } from "./coreFacets";
import {
	aiAutocompleteControllerFacet,
	aiControllerFacet,
	aiInlineCompletionFacet,
	aiInlineHistoryFacet,
	aiReviewControllerFacet,
	aiSuggestionsControllerFacet,
	assetProviderFacet,
	documentOpsToolRuntimeFacet,
	fieldEditorHostFacet,
	historyControllerFacet,
	inputRulesEngineFacet,
	multiplayerControllerFacet,
	searchControllerFacet,
	undoManagerFacet,
	undoMetadataControllerFacet,
	undoRestoreControllerFacet,
} from "./controllerFacets";
import { a11yLabelFacet } from "./a11yFacets";
import { localeFacet, messagesFacet } from "./i18nFacets";

export type SlotDisposition =
	| { kind: "facet"; facet: Facet<unknown, unknown> }
	| { kind: "whenReady" }
	| { kind: "engine" }
	| { kind: "keymapCollector" }
	| { kind: "parked" };

export const SLOT_DEPRECATED_CODE = "slot-deprecated";

export const SLOT_DISPOSITION_BY_KEY: Record<string, SlotDisposition> = {
	[FIELD_EDITOR_SLOT_KEY]: { kind: "facet", facet: fieldEditorHostFacet },
	[COLLECT_KEY_BINDINGS_SLOT_KEY]: { kind: "keymapCollector" },
	[AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY]: { kind: "whenReady" },
	[INPUT_RULES_ENGINE_SLOT_KEY]: { kind: "facet", facet: inputRulesEngineFacet },
	[UNDO_HISTORY_RESTORE_SLOT_KEY]: {
		kind: "facet",
		facet: undoRestoreControllerFacet,
	},
	[UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY]: {
		kind: "facet",
		facet: undoMetadataControllerFacet,
	},
	// AI_INLINE_COMPLETION_SLOT is an alias of this same key.
	[INLINE_COMPLETION_SLOT]: { kind: "facet", facet: aiInlineCompletionFacet },
	[AI_CONTROLLER_SLOT]: { kind: "facet", facet: aiControllerFacet },
	[AI_INLINE_HISTORY_SLOT]: { kind: "facet", facet: aiInlineHistoryFacet },
	[AI_REVIEW_CONTROLLER_SLOT]: { kind: "facet", facet: aiReviewControllerFacet },
	[AI_AUTOCOMPLETE_CONTROLLER_SLOT]: {
		kind: "facet",
		facet: aiAutocompleteControllerFacet,
	},
	[AI_SUGGESTIONS_CONTROLLER_SLOT]: {
		kind: "facet",
		facet: aiSuggestionsControllerFacet,
	},
	[SEARCH_CONTROLLER_SLOT]: { kind: "facet", facet: searchControllerFacet },
	[MULTIPLAYER_CONTROLLER_SLOT]: {
		kind: "facet",
		facet: multiplayerControllerFacet,
	},
	[HISTORY_CONTROLLER_SLOT]: { kind: "facet", facet: historyControllerFacet },
	"paste:importers": { kind: "facet", facet: clipboardFacet },
	"paste:assetProvider": { kind: "facet", facet: assetProviderFacet },
	"undo:manager": { kind: "facet", facet: undoManagerFacet },
	"document-ops:toolRuntime": {
		kind: "facet",
		facet: documentOpsToolRuntimeFacet,
	},
	"pen.locale": { kind: "facet", facet: localeFacet },
	"pen.messages": { kind: "facet", facet: messagesFacet },
	"pen.a11yLabel": { kind: "facet", facet: a11yLabelFacet },
	"react:field-editor": { kind: "facet", facet: fieldEditorHostFacet },
	"core:engine": { kind: "engine" },
	"delta-stream:target": { kind: "parked" },
	[ANNOUNCER_SLOT_KEY]: { kind: "parked" },
};

export function dispositionForSlot(key: string): SlotDisposition | undefined {
	return SLOT_DISPOSITION_BY_KEY[key];
}
