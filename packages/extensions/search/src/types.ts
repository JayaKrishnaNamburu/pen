import type { Unsubscribe } from "@pen/types";

export interface SearchOptions {
	caseSensitive: boolean;
	regex: boolean;
	wholeWord: boolean;
}

export interface SearchMatch {
	kind: "block" | "table-cell" | "database-cell";
	blockId: string;
	from: number;
	to: number;
	text: string;
	index: number;
	row?: number;
	col?: number;
	rowId?: string;
	columnId?: string;
	cellText?: string;
}

export interface SearchState {
	open: boolean;
	query: string;
	replaceText: string;
	matches: readonly SearchMatch[];
	activeIndex: number;
	options: SearchOptions;
}

export interface SearchController {
	getState(): SearchState;
	subscribe(listener: () => void): Unsubscribe;
	open(): void;
	close(): void;
	toggleOpen(): void;
	setQuery(query: string): void;
	setReplaceText(replaceText: string): void;
	setOptions(options: Partial<SearchOptions>): void;
	next(): void;
	previous(): void;
	replace(): void;
	replaceAll(): void;
	recompute(): void;
}
