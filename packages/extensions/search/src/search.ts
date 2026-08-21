import {
	foldAndNormalize,
	localeFacet,
	nextGraphemeBoundary,
	wordRangeAt,
} from "@input/pen-core";
import type { BlockHandle, DiagnosticEvent, DocumentOp, Editor } from "@input/pen-types";
import type { SearchMatch, SearchOptions, SearchState } from "./types";

export const SEARCH_QUERY_MAX_LENGTH = 1_024;
export const SEARCH_EXECUTION_BUDGET_MS = 50;
export const SEARCH_REGEX_SEGMENT_MAX_CODE_UNITS = 64 * 1_024;
export const SEARCH_BUDGET_EXCEEDED_CODE = "search-budget-exceeded";
export const SEARCH_INVALID_PATTERN_CODE = "search-invalid-pattern";
export const DEFAULT_SEARCH_LOCALE = "en";

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
	caseSensitive: false,
	regex: false,
	wholeWord: false,
};

export function createInitialSearchState(): SearchState {
	return {
		open: false,
		query: "",
		replaceText: "",
		matches: [],
		activeIndex: -1,
		options: DEFAULT_SEARCH_OPTIONS,
	};
}

export function findDocumentMatches(
	editor: Editor,
	query: string,
	options: SearchOptions,
): SearchMatch[] {
	if (!query) {
		return [];
	}

	if (query.length > SEARCH_QUERY_MAX_LENGTH) {
		emitSearchDiagnostic(
			editor,
			SEARCH_INVALID_PATTERN_CODE,
			`Search query exceeds the ${SEARCH_QUERY_MAX_LENGTH}-character limit.`,
		);
		return [];
	}

	const locale = resolveSearchLocale(editor, options);
	const regex = options.regex ? buildSearchRegex(query, options) : null;
	if (options.regex && !regex) {
		emitSearchDiagnostic(
			editor,
			SEARCH_INVALID_PATTERN_CODE,
			"Search pattern is invalid.",
		);
		return [];
	}

	const matches: SearchMatch[] = [];
	const deadline = options.regex
		? performance.now() + SEARCH_EXECUTION_BUDGET_MS
		: null;
	const execution: SearchExecution = {
		query,
		options,
		locale,
		regex,
		deadline,
	};

	for (const handle of editor.documentState.allBlocks()) {
		if (hasExceededDeadline(deadline)) {
			emitBudgetExceeded(editor);
			return matches;
		}

		const blockResult = findMatchesInBlock(handle, execution, matches.length);
		matches.push(...blockResult.matches);
		if (blockResult.exceeded) {
			emitBudgetExceeded(editor);
			return matches;
		}
	}

	return matches;
}

export function buildSearchRegex(
	query: string,
	options: SearchOptions,
): RegExp | null {
	if (!query || query.length > SEARCH_QUERY_MAX_LENGTH) {
		return null;
	}

	// LOC4: regex-mode passthrough may contain \b/\w; search does not wrap
	// literals in ASCII word boundaries. Whole-word is a segment check.
	const pattern = options.regex ? query : escapeRegExp(query);
	const flags = options.caseSensitive ? "gu" : "giu";

	try {
		return new RegExp(pattern, flags);
	} catch {
		// invalid user pattern is not a regex.
		return null;
	}
}

export function normalizeActiveIndex(
	activeIndex: number,
	matchCount: number,
): number {
	if (matchCount === 0) {
		return -1;
	}
	if (activeIndex < 0) {
		return 0;
	}
	if (activeIndex >= matchCount) {
		return matchCount - 1;
	}
	return activeIndex;
}

export function getNextActiveIndex(
	activeIndex: number,
	matchCount: number,
): number {
	if (matchCount === 0) {
		return -1;
	}
	if (activeIndex < 0) {
		return 0;
	}
	return (activeIndex + 1) % matchCount;
}

export function getPreviousActiveIndex(
	activeIndex: number,
	matchCount: number,
): number {
	if (matchCount === 0) {
		return -1;
	}
	if (activeIndex <= 0) {
		return matchCount - 1;
	}
	return activeIndex - 1;
}

export function buildReplaceOps(
	match: SearchMatch | null,
	replaceText: string,
): DocumentOp[] {
	if (!match) {
		return [];
	}

	if (match.kind === "block") {
		return [
			{
				type: "delete-text",
				blockId: match.blockId,
				offset: match.from,
				length: match.to - match.from,
			},
			{
				type: "insert-text",
				blockId: match.blockId,
				offset: match.from,
				text: replaceText,
			},
		];
	}

	if (match.kind === "table-cell") {
		return [
			{
				type: "delete-table-cell-text",
				blockId: match.blockId,
				row: match.row ?? 0,
				col: match.col ?? 0,
				offset: match.from,
				length: match.to - match.from,
			},
			{
				type: "insert-table-cell-text",
				blockId: match.blockId,
				row: match.row ?? 0,
				col: match.col ?? 0,
				offset: match.from,
				text: replaceText,
			},
		];
	}

	return [];
}

export function buildReplaceAllOps(
	matches: readonly SearchMatch[],
	replaceText: string,
): DocumentOp[] {
	const matchesByTarget = new Map<string, SearchMatch[]>();

	for (const match of matches) {
		const targetMatches = matchesByTarget.get(getMatchTargetKey(match)) ?? [];
		targetMatches.push(match);
		matchesByTarget.set(getMatchTargetKey(match), targetMatches);
	}

	const ops: DocumentOp[] = [];

	for (const [, blockMatches] of matchesByTarget) {
		const sortedMatches = [...blockMatches].sort((left, right) => {
			return right.from - left.from;
		});
		const firstMatch = sortedMatches[0];
		if (!firstMatch) {
			continue;
		}

		for (const match of sortedMatches) {
			if (match.kind === "block") {
				ops.push(
					{
						type: "delete-text",
						blockId: match.blockId,
						offset: match.from,
						length: match.to - match.from,
					},
					{
						type: "insert-text",
						blockId: match.blockId,
						offset: match.from,
						text: replaceText,
					},
				);
				continue;
			}

			ops.push(
				{
					type: "delete-table-cell-text",
					blockId: match.blockId,
					row: match.row ?? 0,
					col: match.col ?? 0,
					offset: match.from,
					length: match.to - match.from,
				},
				{
					type: "insert-table-cell-text",
					blockId: match.blockId,
					row: match.row ?? 0,
					col: match.col ?? 0,
					offset: match.from,
					text: replaceText,
				},
			);
		}
	}

	return ops;
}

export function revealActiveMatch(
	editor: Editor,
	match: SearchMatch | null,
): void {
	if (!match) {
		return;
	}

	if (match.kind === "block") {
		editor.selectText(match.blockId, match.from, match.to);
	} else {
		const row = match.row ?? 0;
		const col = match.col ?? 0;
		editor.selectCellRange(
			match.blockId,
			{ row, col },
			{ row, col },
		);
	}
	editor.scrollToBlock?.(match.blockId);
}

interface SearchExecution {
	query: string;
	options: SearchOptions;
	locale: string;
	regex: RegExp | null;
	deadline: number | null;
}

function findMatchesInBlock(
	handle: BlockHandle,
	execution: SearchExecution,
	startIndex: number,
): { matches: SearchMatch[]; exceeded: boolean } {
	const matches: SearchMatch[] = [];

	const text = handle.textContent();
	if (text) {
		const textResult = collectMatchesInText(
			text,
			execution,
			startIndex,
			(from, to, matchedText, index) => ({
				kind: "block",
				blockId: handle.id,
				from,
				to,
				text: matchedText,
				index,
			}),
		);
		matches.push(...textResult.matches);
		if (textResult.exceeded) {
			return { matches, exceeded: true };
		}
	}

	const tableResult = findMatchesInGridCells(
		handle,
		execution,
		startIndex + matches.length,
	);
	matches.push(...tableResult.matches);
	if (tableResult.exceeded) {
		return { matches, exceeded: true };
	}

	return { matches, exceeded: false };
}

function findMatchesInGridCells(
	handle: BlockHandle,
	execution: SearchExecution,
	startIndex: number,
): { matches: SearchMatch[]; exceeded: boolean } {
	const table = handle.as("table");
	if (!table) {
		return { matches: [], exceeded: false };
	}

	const matches: SearchMatch[] = [];
	const rowCount = table.tableRowCount();
	const columnCount = table.tableColumnCount();
	for (let row = 0; row < rowCount; row += 1) {
		for (let col = 0; col < columnCount; col += 1) {
			const cell = table.tableCell(row, col);
			const cellText = cell?.textContent() ?? "";
			if (!cellText) {
				continue;
			}
			const cellResult = collectMatchesInText(
				cellText,
				execution,
				startIndex + matches.length,
				(from, to, matchedText, index) => ({
					kind: "table-cell",
					blockId: handle.id,
					row,
					col,
					from,
					to,
					text: matchedText,
					index,
					cellText,
				}),
			);
			matches.push(...cellResult.matches);
			if (cellResult.exceeded) {
				return { matches, exceeded: true };
			}
		}
	}

	return { matches, exceeded: false };
}

function collectMatchesInText(
	text: string,
	execution: SearchExecution,
	startIndex: number,
	createMatch: (
		from: number,
		to: number,
		matchedText: string,
		index: number,
	) => SearchMatch,
): { matches: SearchMatch[]; exceeded: boolean } {
	if (execution.regex) {
		return collectSegmentedMatches(
			text,
			execution,
			startIndex,
			createMatch,
		);
	}

	return {
		matches: collectLiteralMatches(text, execution, startIndex, createMatch),
		exceeded: false,
	};
}

function collectSegmentedMatches(
	text: string,
	execution: SearchExecution,
	startIndex: number,
	createMatch: (
		from: number,
		to: number,
		matchedText: string,
		index: number,
	) => SearchMatch,
): { matches: SearchMatch[]; exceeded: boolean } {
	const matches: SearchMatch[] = [];
	const regex = execution.regex;
	if (!regex) {
		return { matches, exceeded: false };
	}

	for (
		let segmentStart = 0;
		segmentStart < text.length;
		segmentStart += SEARCH_REGEX_SEGMENT_MAX_CODE_UNITS
	) {
		if (hasExceededDeadline(execution.deadline)) {
			return { matches, exceeded: true };
		}

		const segment = text.slice(
			segmentStart,
			segmentStart + SEARCH_REGEX_SEGMENT_MAX_CODE_UNITS,
		);
		matches.push(
			...collectTextMatches(
				text,
				segment,
				segmentStart,
				regex,
				execution,
				startIndex + matches.length,
				createMatch,
			),
		);
	}

	return { matches, exceeded: false };
}

function collectTextMatches(
	text: string,
	segment: string,
	segmentStart: number,
	regex: RegExp,
	execution: SearchExecution,
	startIndex: number,
	createMatch: (
		from: number,
		to: number,
		matchedText: string,
		index: number,
	) => SearchMatch,
): SearchMatch[] {
	const matches: SearchMatch[] = [];
	const localRegex = new RegExp(regex.source, regex.flags);
	let match: RegExpExecArray | null;

	while ((match = localRegex.exec(segment)) !== null) {
		const from = segmentStart + match.index;
		const to = from + match[0].length;
		if (
			!execution.options.wholeWord ||
			isWholeWordMatch(text, from, to, execution.locale)
		) {
			matches.push(
				createMatch(from, to, match[0], startIndex + matches.length),
			);
		}

		if (!localRegex.global) {
			break;
		}

		if (match[0].length === 0) {
			localRegex.lastIndex += 1;
		}
	}

	return matches;
}

function collectLiteralMatches(
	text: string,
	execution: SearchExecution,
	startIndex: number,
	createMatch: (
		from: number,
		to: number,
		matchedText: string,
		index: number,
	) => SearchMatch,
): SearchMatch[] {
	const matches: SearchMatch[] = [];
	const ranges = execution.options.caseSensitive
		? findExactRanges(text, execution.query)
		: findFoldedRanges(text, execution.query, execution.locale);

	for (const range of ranges) {
		if (
			execution.options.wholeWord &&
			!isWholeWordMatch(text, range.from, range.to, execution.locale)
		) {
			continue;
		}

		matches.push(
			createMatch(
				range.from,
				range.to,
				text.slice(range.from, range.to),
				startIndex + matches.length,
			),
		);
	}

	return matches;
}

function getMatchTargetKey(match: SearchMatch): string {
	if (match.kind === "block") {
		return `block:${match.blockId}`;
	}
	return `table:${match.blockId}:${match.row ?? -1}:${match.col ?? -1}`;
}

function resolveSearchLocale(editor: Editor, options: SearchOptions): string {
	return options.locale ?? editor.facet(localeFacet);
}

function isWordSegmentBoundary(
	text: string,
	offset: number,
	locale: string,
): boolean {
	if (offset <= 0 || offset >= text.length) {
		return true;
	}

	const range = wordRangeAt(text, offset, locale);
	if (!range) {
		return true;
	}

	return offset === range.start || offset === range.end;
}

function isWholeWordMatch(
	text: string,
	from: number,
	to: number,
	locale: string,
): boolean {
	return (
		isWordSegmentBoundary(text, from, locale) &&
		isWordSegmentBoundary(text, to, locale)
	);
}

function findExactRanges(
	text: string,
	query: string,
): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	let searchFrom = 0;

	while (searchFrom <= text.length - query.length) {
		const index = text.indexOf(query, searchFrom);
		if (index === -1) {
			break;
		}
		ranges.push({ from: index, to: index + query.length });
		searchFrom = index + query.length;
	}

	return ranges;
}

function findFoldedRanges(
	text: string,
	query: string,
	locale: string,
): Array<{ from: number; to: number }> {
	const foldedQuery = foldAndNormalize(query, locale);
	if (!foldedQuery) {
		return [];
	}

	const { folded, originAt } = foldTextWithOriginMap(text, locale);
	const ranges: Array<{ from: number; to: number }> = [];
	let searchFrom = 0;

	while (searchFrom <= folded.length - foldedQuery.length) {
		const index = folded.indexOf(foldedQuery, searchFrom);
		if (index === -1) {
			break;
		}

		const from = originAt[index] ?? 0;
		const to = originAt[index + foldedQuery.length] ?? text.length;
		if (to > from) {
			ranges.push({ from, to });
			searchFrom = index + foldedQuery.length;
			continue;
		}

		searchFrom = index + 1;
	}

	return ranges;
}

function foldTextWithOriginMap(
	text: string,
	locale: string,
): { folded: string; originAt: number[] } {
	const foldedWhole = foldAndNormalize(text, locale);
	if (foldedWhole.length === text.length) {
		const originAt = new Array<number>(foldedWhole.length + 1);
		for (let index = 0; index <= foldedWhole.length; index += 1) {
			originAt[index] = index;
		}
		return { folded: foldedWhole, originAt };
	}

	let folded = "";
	const originAt: number[] = [];
	let offset = 0;
	while (offset < text.length) {
		const next = nextGraphemeBoundary(text, offset, locale);
		const piece = foldAndNormalize(text.slice(offset, next), locale);
		for (let index = 0; index < piece.length; index += 1) {
			originAt.push(offset);
		}
		folded += piece;
		offset = next;
	}
	originAt.push(text.length);
	return { folded, originAt };
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExceededDeadline(deadline: number | null): boolean {
	return deadline !== null && performance.now() >= deadline;
}

function emitBudgetExceeded(editor: Editor): void {
	emitSearchDiagnostic(
		editor,
		SEARCH_BUDGET_EXCEEDED_CODE,
		"Search stopped after the execution budget was exceeded.",
	);
}

function emitSearchDiagnostic(
	editor: Editor,
	code: string,
	message: string,
): void {
	const event: DiagnosticEvent = {
		code,
		level: "warn",
		source: "search",
		extension: "search",
		message,
	};
	editor.internals.emit("diagnostic", event);
}
