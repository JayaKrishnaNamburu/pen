/**
 * Wave 2.2: CommitEvent lives on `types/editor.ts` and the types barrel.
 * This module re-exports the spec shape for existing `./commit` imports.
 */

export type {
	CommitEvent,
	CommitEventSource,
	Diagnostic,
	SelectionRecord,
} from "./editor";
