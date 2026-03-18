import type { Editor } from "@pen/types";
import type {
	SearchController,
	SearchMatch,
	SearchOptions,
	SearchState,
} from "./types";
import {
	buildReplaceAllOps,
	buildReplaceOps,
	createInitialSearchState,
	findDocumentMatches,
	getNextActiveIndex,
	getPreviousActiveIndex,
	normalizeActiveIndex,
	revealActiveMatch,
} from "./search";

export class SearchControllerImpl implements SearchController {
	private readonly editor: Editor;
	private state: SearchState;
	private readonly listeners = new Set<() => void>();

	constructor(editor: Editor) {
		this.editor = editor;
		this.state = createInitialSearchState();
	}

	getState(): SearchState {
		return this.state;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	open(): void {
		this.updateState({
			...this.state,
			open: true,
		});
	}

	close(): void {
		this.updateState({
			...this.state,
			open: false,
		});
	}

	toggleOpen(): void {
		this.updateState({
			...this.state,
			open: !this.state.open,
		});
	}

	setQuery(query: string): void {
		const nextState = {
			...this.state,
			query,
			activeIndex: query ? this.state.activeIndex : -1,
		};
		if (!this.updateState(nextState)) {
			return;
		}
		this.recompute();
	}

	setReplaceText(replaceText: string): void {
		this.updateState({
			...this.state,
			replaceText,
		});
	}

	setOptions(options: Partial<SearchOptions>): void {
		const nextState = {
			...this.state,
			options: {
				...this.state.options,
				...options,
			},
		};
		if (!this.updateState(nextState)) {
			return;
		}
		this.recompute();
	}

	next(): void {
		const nextIndex = getNextActiveIndex(
			this.state.activeIndex,
			this.state.matches.length,
		);
		if (
			nextIndex === this.state.activeIndex &&
			this.state.matches.length === 0
		) {
			return;
		}
		this.state = {
			...this.state,
			activeIndex: nextIndex,
		};
		revealActiveMatch(this.editor, this.getActiveMatch());
		this.notify();
	}

	previous(): void {
		const previousIndex = getPreviousActiveIndex(
			this.state.activeIndex,
			this.state.matches.length,
		);
		if (
			previousIndex === this.state.activeIndex &&
			this.state.matches.length === 0
		) {
			return;
		}
		this.state = {
			...this.state,
			activeIndex: previousIndex,
		};
		revealActiveMatch(this.editor, this.getActiveMatch());
		this.notify();
	}

	replace(): void {
		const activeMatch = this.getActiveMatch();
		const ops = buildReplaceOps(activeMatch, this.state.replaceText);
		if (ops.length === 0) {
			return;
		}

		this.editor.apply(ops, {
			origin: "user",
			undoGroup: true,
		});
		this.recompute();
		revealActiveMatch(this.editor, this.getActiveMatch());
	}

	replaceAll(): void {
		const ops = buildReplaceAllOps(this.state.matches, this.state.replaceText);
		if (ops.length === 0) {
			return;
		}

		this.editor.apply(ops, {
			origin: "user",
			undoGroup: true,
		});
		this.recompute();
	}

	recompute(): void {
		const matches = findDocumentMatches(
			this.editor,
			this.state.query,
			this.state.options,
		);
		this.updateState({
			...this.state,
			matches,
			activeIndex: normalizeActiveIndex(this.state.activeIndex, matches.length),
		});
	}

	private getActiveMatch(): SearchMatch | null {
		return this.state.matches[this.state.activeIndex] ?? null;
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private updateState(nextState: SearchState): boolean {
		if (searchStatesEqual(this.state, nextState)) {
			return false;
		}

		this.state = nextState;
		this.notify();
		return true;
	}
}

function searchStatesEqual(left: SearchState, right: SearchState): boolean {
	return (
		left.open === right.open &&
		left.query === right.query &&
		left.replaceText === right.replaceText &&
		left.activeIndex === right.activeIndex &&
		left.options.caseSensitive === right.options.caseSensitive &&
		left.options.regex === right.options.regex &&
		left.options.wholeWord === right.options.wholeWord &&
		searchMatchesEqual(left.matches, right.matches)
	);
}

function searchMatchesEqual(
	left: readonly SearchMatch[],
	right: readonly SearchMatch[],
): boolean {
	if (left.length !== right.length) {
		return false;
	}

	for (let index = 0; index < left.length; index += 1) {
		const leftMatch = left[index];
		const rightMatch = right[index];
		if (
			leftMatch?.kind !== rightMatch?.kind ||
			leftMatch?.blockId !== rightMatch?.blockId ||
			leftMatch?.row !== rightMatch?.row ||
			leftMatch?.col !== rightMatch?.col ||
			leftMatch?.rowId !== rightMatch?.rowId ||
			leftMatch?.columnId !== rightMatch?.columnId ||
			leftMatch?.cellText !== rightMatch?.cellText ||
			leftMatch?.from !== rightMatch?.from ||
			leftMatch?.to !== rightMatch?.to ||
			leftMatch?.text !== rightMatch?.text ||
			leftMatch?.index !== rightMatch?.index
		) {
			return false;
		}
	}

	return true;
}
