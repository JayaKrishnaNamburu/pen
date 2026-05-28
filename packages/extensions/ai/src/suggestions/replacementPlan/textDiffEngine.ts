import type { DocumentOp } from "@pen/types";

export type ReplacementTextDiffOperation = Extract<
	DocumentOp,
	{ type: "delete-text" | "insert-text" | "replace-text" }
>;

export type TextToken = {
	text: string;
	start: number;
	end: number;
};

export type DiffHunk = {
	originalStart: number;
	deletedText: string;
	insertedText: string;
};

export const DEFAULT_MAX_DIFF_CELLS = 20_000;

const NOISY_REPLACEMENT_MIN_TEXT_LENGTH = 80;
const NOISY_REPLACEMENT_MIN_HUNKS = 4;
const NOISY_REPLACEMENT_MIN_CHANGED_RATIO = 0.45;

export interface CompileReplacementSuggestionOpsInput {
	blockId: string;
	offset: number;
	originalText: string;
	replacementText: string;
	maxDiffCells?: number;
}

export function compileReplacementSuggestionOps({
	blockId,
	offset,
	originalText,
	replacementText,
	maxDiffCells = DEFAULT_MAX_DIFF_CELLS,
}: CompileReplacementSuggestionOpsInput): ReplacementTextDiffOperation[] {
	if (originalText === replacementText) {
		return [];
	}

	if (originalText.length === 0) {
		return replacementText.length === 0
			? []
			: [{ type: "insert-text", blockId, offset, text: replacementText }];
	}

	if (replacementText.length === 0) {
		return [
			{
				type: "delete-text",
				blockId,
				offset,
				length: originalText.length,
			},
		];
	}

	const originalTokens = tokenizeText(originalText);
	const replacementTokens = tokenizeText(replacementText);
	if (
		originalTokens.length === 0 ||
		replacementTokens.length === 0 ||
		originalTokens.length * replacementTokens.length > maxDiffCells
	) {
		return [
			{
				type: "replace-text",
				blockId,
				offset,
				length: originalText.length,
				text: replacementText,
			},
		];
	}

	const hunks = diffTokens(originalTokens, replacementTokens);
	if (shouldUseCoarseReplacement({ hunks, originalText, replacementText })) {
		return [
			{
				type: "replace-text",
				blockId,
				offset,
				length: originalText.length,
				text: replacementText,
			},
		];
	}
	return hunksToOperations({ blockId, hunks: [...hunks].reverse(), offset });
}

export function tokenizeText(text: string): TextToken[] {
	const tokens: TextToken[] = [];
	let index = 0;

	while (index < text.length) {
		const start = index;
		const char = text[index] ?? "";

		if (char === "\r" || char === "\n") {
			if (char === "\r" && text[index + 1] === "\n") {
				index += 2;
			} else {
				index += 1;
			}
			tokens.push({ text: text.slice(start, index), start, end: index });
			continue;
		}

		if (isWhitespace(char)) {
			index += 1;
			while (
				index < text.length &&
				isWhitespace(text[index] ?? "") &&
				text[index] !== "\r" &&
				text[index] !== "\n"
			) {
				index += 1;
			}
			tokens.push({ text: text.slice(start, index), start, end: index });
			continue;
		}

		if (isWordChar(char)) {
			index += 1;
			while (index < text.length && isWordChar(text[index] ?? "")) {
				index += 1;
			}
			tokens.push({ text: text.slice(start, index), start, end: index });
			continue;
		}

		index += 1;
		while (
			index < text.length &&
			!isWhitespace(text[index] ?? "") &&
			!isWordChar(text[index] ?? "")
		) {
			index += 1;
		}
		tokens.push({ text: text.slice(start, index), start, end: index });
	}

	return tokens;
}

export function diffTokens(
	originalTokens: readonly TextToken[],
	replacementTokens: readonly TextToken[],
): DiffHunk[] {
	const prefixLength = countSharedPrefix(originalTokens, replacementTokens);
	const suffixLength = countSharedSuffix(
		originalTokens,
		replacementTokens,
		prefixLength,
	);
	const originalOffset =
		originalTokens[prefixLength]?.start ??
		(prefixLength > 0 ? originalTokens[prefixLength - 1]!.end : 0);
	const originalMiddle = originalTokens
		.slice(prefixLength, originalTokens.length - suffixLength)
		.map((token) => ({
			...token,
			start: token.start - originalOffset,
			end: token.end - originalOffset,
		}));
	const replacementMiddle = replacementTokens.slice(
		prefixLength,
		replacementTokens.length - suffixLength,
	);
	const middleHunks = diffTokenMiddle(originalMiddle, replacementMiddle);

	return middleHunks.map((hunk) => ({
		...hunk,
		originalStart: hunk.originalStart + originalOffset,
	}));
}

export function diffTokenMiddle(
	originalTokens: readonly TextToken[],
	replacementTokens: readonly TextToken[],
): DiffHunk[] {
	const rowCount = originalTokens.length + 1;
	const columnCount = replacementTokens.length + 1;
	const lcs: number[][] = Array.from({ length: rowCount }, () =>
		Array<number>(columnCount).fill(0),
	);

	for (
		let originalIndex = originalTokens.length - 1;
		originalIndex >= 0;
		originalIndex -= 1
	) {
		for (
			let replacementIndex = replacementTokens.length - 1;
			replacementIndex >= 0;
			replacementIndex -= 1
		) {
			lcs[originalIndex]![replacementIndex] =
				originalTokens[originalIndex]!.text ===
				replacementTokens[replacementIndex]!.text
					? lcs[originalIndex + 1]![replacementIndex + 1]! + 1
					: Math.max(
							lcs[originalIndex + 1]![replacementIndex]!,
							lcs[originalIndex]![replacementIndex + 1]!,
						);
		}
	}

	const hunks: DiffHunk[] = [];
	let current: DiffHunk | null = null;
	let originalIndex = 0;
	let replacementIndex = 0;
	let originalCursor = 0;

	const flush = () => {
		if (
			current &&
			(current.deletedText.length > 0 || current.insertedText.length > 0)
		) {
			hunks.push(current);
		}
		current = null;
	};

	while (
		originalIndex < originalTokens.length ||
		replacementIndex < replacementTokens.length
	) {
		const originalToken = originalTokens[originalIndex];
		const replacementToken = replacementTokens[replacementIndex];

		if (
			originalToken &&
			replacementToken &&
			originalToken.text === replacementToken.text
		) {
			flush();
			originalCursor = originalToken.end;
			originalIndex += 1;
			replacementIndex += 1;
			continue;
		}

		if (!current) {
			current = {
				originalStart: originalToken?.start ?? originalCursor,
				deletedText: "",
				insertedText: "",
			};
		}

		if (
			!originalToken ||
			(replacementToken &&
				lcs[originalIndex]![replacementIndex + 1]! >=
					lcs[originalIndex + 1]![replacementIndex]!)
		) {
			current.insertedText += replacementToken?.text ?? "";
			replacementIndex += 1;
			continue;
		}

		current.deletedText += originalToken.text;
		originalCursor = originalToken.end;
		originalIndex += 1;
	}
	flush();

	return hunks;
}

export function hunksToOperations({
	blockId,
	hunks,
	offset,
}: {
	blockId: string;
	hunks: readonly DiffHunk[];
	offset: number;
}): ReplacementTextDiffOperation[] {
	const operations: ReplacementTextDiffOperation[] = [];
	for (const hunk of hunks) {
		const deleteOffset = offset + hunk.originalStart;
		if (hunk.deletedText.length > 0) {
			operations.push({
				type: "delete-text",
				blockId,
				offset: deleteOffset,
				length: hunk.deletedText.length,
			});
		}
		if (hunk.insertedText.length > 0) {
			operations.push({
				type: "insert-text",
				blockId,
				offset: deleteOffset + hunk.deletedText.length,
				text: hunk.insertedText,
			});
		}
	}
	return operations;
}

export function shouldUseCoarseReplacement({
	hunks,
	originalText,
	replacementText,
}: {
	hunks: readonly DiffHunk[];
	originalText: string;
	replacementText: string;
}): boolean {
	if (
		Math.max(originalText.length, replacementText.length) <
			NOISY_REPLACEMENT_MIN_TEXT_LENGTH ||
		hunks.length < NOISY_REPLACEMENT_MIN_HUNKS
	) {
		return false;
	}

	const changedLength = hunks.reduce(
		(total, hunk) =>
			total + hunk.deletedText.length + hunk.insertedText.length,
		0,
	);
	const changedRatio =
		changedLength / Math.max(originalText.length, replacementText.length);

	return changedRatio >= NOISY_REPLACEMENT_MIN_CHANGED_RATIO;
}

function countSharedPrefix(
	left: readonly TextToken[],
	right: readonly TextToken[],
): number {
	let index = 0;
	while (
		index < left.length &&
		index < right.length &&
		left[index]!.text === right[index]!.text
	) {
		index += 1;
	}
	return index;
}

function countSharedSuffix(
	left: readonly TextToken[],
	right: readonly TextToken[],
	prefixLength: number,
): number {
	let count = 0;
	while (
		left.length - count > prefixLength &&
		right.length - count > prefixLength &&
		left[left.length - count - 1]!.text ===
			right[right.length - count - 1]!.text
	) {
		count += 1;
	}
	return count;
}

function isWhitespace(char: string): boolean {
	return /\s/u.test(char);
}

function isWordChar(char: string): boolean {
	return /[\p{L}\p{N}'’]/u.test(char);
}
