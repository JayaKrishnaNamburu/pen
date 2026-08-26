/**
 * CommitEvent lives on `types/editor.ts` and the types barrel.
 * This module re-exports the spec shape for existing `./commit` imports.
 */

export type {
	CommitEvent,
	CommitEventSource,
	SelectionRecord,
} from "./editor";
