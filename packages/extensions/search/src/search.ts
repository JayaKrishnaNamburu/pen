import type { BlockHandle, DocumentOp, Editor } from "@pen/types";
import type { SearchMatch, SearchOptions, SearchState } from "./types";

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

	const regex = buildSearchRegex(query, options);
	if (!regex) {
		return [];
	}

	const matches: SearchMatch[] = [];

	for (const handle of editor.documentState.allBlocks()) {
		matches.push(...findMatchesInBlock(handle, regex, matches.length));
	}

	return matches;
}

export function buildSearchRegex(
	query: string,
	options: SearchOptions,
): RegExp | null {
	if (!query) {
		return null;
	}

	let pattern = options.regex ? query : escapeRegExp(query);
	if (options.wholeWord) {
		pattern = `\\b${pattern}\\b`;
	}

	const flags = options.caseSensitive ? "g" : "gi";

	try {
		return new RegExp(pattern, flags);
	} catch {
		try {
			return new RegExp(escapeRegExp(query), flags);
		} catch {
			return null;
		}
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

	if (!match.rowId || !match.columnId || match.cellText == null) {
		return [];
	}

	return [{
		type: "database-update-cell",
		blockId: match.blockId,
		rowId: match.rowId,
		columnId: match.columnId,
		value: applyMatchesToText(match.cellText, [match], replaceText),
	}];
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

		if (firstMatch.kind === "database-cell") {
			if (!firstMatch.rowId || !firstMatch.columnId || firstMatch.cellText == null) {
				continue;
			}
			ops.push({
				type: "database-update-cell",
				blockId: firstMatch.blockId,
				rowId: firstMatch.rowId,
				columnId: firstMatch.columnId,
				value: applyMatchesToText(firstMatch.cellText, sortedMatches, replaceText),
			});
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

function findMatchesInBlock(
	handle: BlockHandle,
	regex: RegExp,
	startIndex: number,
): SearchMatch[] {
	const matches: SearchMatch[] = [];

	const text = handle.textContent();
	if (text) {
		matches.push(
			...collectTextMatches(text, regex, startIndex, (match, index) => ({
				kind: "block",
				blockId: handle.id,
				from: match.index,
				to: match.index + match[0].length,
				text: match[0],
				index,
			})),
		);
	}

	const tableMatches = findMatchesInGridCells(handle, regex, startIndex + matches.length);
	matches.push(...tableMatches);

	if (handle.type === "database") {
		const databaseMatches = findMatchesInDatabaseCells(
			handle,
			regex,
			startIndex + matches.length,
		);
		matches.push(...databaseMatches);
	}

	return matches;
}

function findMatchesInGridCells(
	handle: BlockHandle,
	regex: RegExp,
	startIndex: number,
): SearchMatch[] {
	if (handle.type !== "table") {
		return [];
	}

	const matches: SearchMatch[] = [];
	const rowCount = handle.tableRowCount();
	const columnCount = handle.tableColumnCount();
	for (let row = 0; row < rowCount; row += 1) {
		for (let col = 0; col < columnCount; col += 1) {
			const cell = handle.tableCell(row, col);
			const cellText = cell?.textContent() ?? "";
			if (!cellText) {
				continue;
			}
			matches.push(
				...collectTextMatches(cellText, regex, startIndex + matches.length, (match, index) => ({
					kind: "table-cell",
					blockId: handle.id,
					row,
					col,
					from: match.index,
					to: match.index + match[0].length,
					text: match[0],
					index,
					cellText,
				})),
			);
		}
	}

	return matches;
}

function findMatchesInDatabaseCells(
	handle: BlockHandle,
	regex: RegExp,
	startIndex: number,
): SearchMatch[] {
	const columns = handle.tableColumns();
	if (columns.length === 0) {
		return [];
	}

	const matches: SearchMatch[] = [];
	const rowCount = handle.tableRowCount();
	for (let row = 0; row < rowCount; row += 1) {
		const rowHandle = handle.tableRow(row);
		const rowId = rowHandle?.id;
		if (!rowId) {
			continue;
		}
		for (let col = 0; col < columns.length; col += 1) {
			const column = columns[col]!;
			const cellText = handle.tableCell(row, col)?.textContent() ?? "";
			if (!cellText) {
				continue;
			}
			matches.push(
				...collectTextMatches(cellText, regex, startIndex + matches.length, (match, index) => ({
					kind: "database-cell",
					blockId: handle.id,
					row,
					col,
					rowId,
					columnId: column.id,
					from: match.index,
					to: match.index + match[0].length,
					text: match[0],
					index,
					cellText,
				})),
			);
		}
	}

	return matches;
}

function collectTextMatches(
	text: string,
	regex: RegExp,
	startIndex: number,
	createMatch: (match: RegExpExecArray, index: number) => SearchMatch,
): SearchMatch[] {
	const matches: SearchMatch[] = [];
	const localRegex = new RegExp(regex.source, regex.flags);
	let match: RegExpExecArray | null;

	while ((match = localRegex.exec(text)) !== null) {
		matches.push(createMatch(match, startIndex + matches.length));

		if (!localRegex.global) {
			break;
		}

		if (match[0].length === 0) {
			localRegex.lastIndex += 1;
		}
	}

	return matches;
}

function getMatchTargetKey(match: SearchMatch): string {
	if (match.kind === "block") {
		return `block:${match.blockId}`;
	}
	if (match.kind === "table-cell") {
		return `table:${match.blockId}:${match.row ?? -1}:${match.col ?? -1}`;
	}
	return `database:${match.blockId}:${match.rowId ?? ""}:${match.columnId ?? ""}`;
}

function applyMatchesToText(
	text: string,
	matches: readonly SearchMatch[],
	replaceText: string,
): string {
	let nextText = text;
	for (const match of [...matches].sort((left, right) => right.from - left.from)) {
		nextText =
			nextText.slice(0, match.from) +
			replaceText +
			nextText.slice(match.to);
	}
	return nextText;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
