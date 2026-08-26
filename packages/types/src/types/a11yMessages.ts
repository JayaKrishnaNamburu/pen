export type A11yMessageKey =
	| "blockConverted"
	| "undoApplied"
	| "redoApplied"
	| "blockSelectionEntered"
	| "blockSelectionChanged"
	| "cellSelectionChanged"
	| "suggestionAppeared"
	| "suggestionAccepted"
	| "suggestionRejected"
	| "streamingStarted"
	| "streamingFinished"
	| "findMatches"
	| "atomSelected"
	| "collaboratorJoined"
	| "collaboratorEditing";

export type A11yMessageCatalog = Record<A11yMessageKey, string>;
