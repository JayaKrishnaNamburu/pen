import { createHash } from "node:crypto";
import type { DocumentOp } from "@input/pen-types";

/**
 * 10k-word fixture plus a table-cell cohort. Deterministic:
 * Numerical Recipes LCG with a fixed seed walks a 32-word lexicon.
 * Paragraphs keep seed `TEN_K_SEED`; cells use `TEN_K_CELL_SEED` so the
 * 20×500 walk stays bit-identical. `contentSha256` covers paragraphs and
 * cells. A reviewer comparing two baselines can tell a generator change
 * (hash moves) from a scheduler change (hash stable, numbers move).
 */
export const TEN_K_FIXTURE_ID = "ten-k-words";
const TEN_K_SEED = 0x70656e33;
export const TEN_K_PARAGRAPH_COUNT = 20;
const TEN_K_WORDS_PER_PARAGRAPH = 500;
export const TEN_K_WORD_COUNT =
	TEN_K_PARAGRAPH_COUNT * TEN_K_WORDS_PER_PARAGRAPH;
const TEN_K_BLOCK_PREFIX = "w3-10k-p";
export const TEN_K_TABLE_ID = "w3-10k-table";
/** Independent of the paragraph seed so the 20×500 LCG walk stays bit-identical. */
const TEN_K_CELL_SEED = 0x63656c6c;
export const TEN_K_CELL_ROWS = 2;
export const TEN_K_CELL_COLS = 2;
const TEN_K_WORDS_PER_CELL = 50;
export const TEN_K_CELL_COUNT = TEN_K_CELL_ROWS * TEN_K_CELL_COLS;
export const TEN_K_CELL_WORD_COUNT = TEN_K_CELL_COUNT * TEN_K_WORDS_PER_CELL;

const TEN_K_LEXICON = [
	"the",
	"quick",
	"brown",
	"fox",
	"jumps",
	"over",
	"lazy",
	"dog",
	"pack",
	"my",
	"box",
	"with",
	"five",
	"dozen",
	"liquor",
	"jugs",
	"editor",
	"block",
	"caret",
	"flush",
	"phase",
	"read",
	"write",
	"frame",
	"word",
	"line",
	"range",
	"point",
	"rect",
	"cache",
	"commit",
	"origin",
] as const;

export const TEN_K_GENERATOR = {
	algorithm: "lcg-numerical-recipes",
	multiplier: 1664525,
	increment: 1013904223,
	seed: TEN_K_SEED,
	lexicon: [...TEN_K_LEXICON],
	paragraphCount: TEN_K_PARAGRAPH_COUNT,
	wordsPerParagraph: TEN_K_WORDS_PER_PARAGRAPH,
	cellSeed: TEN_K_CELL_SEED,
	cellRows: TEN_K_CELL_ROWS,
	cellCols: TEN_K_CELL_COLS,
	wordsPerCell: TEN_K_WORDS_PER_CELL,
} as const;

export type TenKCellText = {
	row: number;
	col: number;
	text: string;
};

export function tenKBlockId(index: number): string {
	return `${TEN_K_BLOCK_PREFIX}${String(index).padStart(2, "0")}`;
}

export function generateTenKParagraphs(): string[] {
	let seed = TEN_K_SEED >>> 0;
	const paragraphs: string[] = [];
	for (let p = 0; p < TEN_K_PARAGRAPH_COUNT; p += 1) {
		const words: string[] = [];
		for (let w = 0; w < TEN_K_WORDS_PER_PARAGRAPH; w += 1) {
			seed =
				(Math.imul(seed, TEN_K_GENERATOR.multiplier) +
					TEN_K_GENERATOR.increment) >>>
				0;
			const word = TEN_K_LEXICON[seed % TEN_K_LEXICON.length];
			if (word === undefined) {
				throw new Error(
					"tenKWordFixture: lexicon walk went out of range",
				);
			}
			words.push(word);
		}
		paragraphs.push(words.join(" "));
	}
	return paragraphs;
}

function countWords(text: string): number {
	return text.split(" ").filter((word) => word.length > 0).length;
}

function walkLexicon(
	seedStart: number,
	wordCount: number,
): { text: string; seed: number } {
	let seed = seedStart >>> 0;
	const words: string[] = [];
	for (let index = 0; index < wordCount; index += 1) {
		seed =
			(Math.imul(seed, TEN_K_GENERATOR.multiplier) +
				TEN_K_GENERATOR.increment) >>>
			0;
		const word = TEN_K_LEXICON[seed % TEN_K_LEXICON.length];
		if (word === undefined) {
			throw new Error("tenKWordFixture: lexicon walk went out of range");
		}
		words.push(word);
	}
	return { text: words.join(" "), seed };
}

export function generateTenKCells(): TenKCellText[] {
	const cells: TenKCellText[] = [];
	let seed = TEN_K_CELL_SEED >>> 0;
	for (let row = 0; row < TEN_K_CELL_ROWS; row += 1) {
		for (let col = 0; col < TEN_K_CELL_COLS; col += 1) {
			const walked = walkLexicon(seed, TEN_K_WORDS_PER_CELL);
			seed = walked.seed;
			cells.push({ row, col, text: walked.text });
		}
	}
	return cells;
}

export function tenKParagraphsSha256(paragraphs: readonly string[]): string {
	return createHash("sha256")
		.update(paragraphs.join("\n"), "utf8")
		.digest("hex");
}

export function tenKFixtureIdentity(
	paragraphs: readonly string[],
	cells: readonly TenKCellText[],
): {
	id: string;
	wordCount: number;
	paragraphCount: number;
	cellCount: number;
	cellWordCount: number;
	paragraphSha256: string;
	contentSha256: string;
} {
	const cellLines = cells.map(
		(cell) => `${cell.row},${cell.col}:${cell.text}`,
	);
	const joined = [...paragraphs, ...cellLines].join("\n");
	const paragraphWords = paragraphs.reduce(
		(count, paragraph) => count + countWords(paragraph),
		0,
	);
	const cellWords = cells.reduce((count, cell) => count + countWords(cell.text), 0);
	return {
		id: TEN_K_FIXTURE_ID,
		wordCount: paragraphWords + cellWords,
		paragraphCount: paragraphs.length,
		cellCount: cells.length,
		cellWordCount: cellWords,
		paragraphSha256: tenKParagraphsSha256(paragraphs),
		contentSha256: createHash("sha256")
			.update(joined, "utf8")
			.digest("hex"),
	};
}

export function tenKWordOps(
	existingFirstId: string,
	existingLength: number,
): DocumentOp[] {
	const paragraphs = generateTenKParagraphs();
	const first = paragraphs[0];
	if (first === undefined) {
		throw new Error("tenKWordFixture: generator produced no paragraphs");
	}
	const ops: DocumentOp[] = [];
	if (existingLength > 0) {
		ops.push({
			type: "splice-text",
			blockId: existingFirstId,
			from: 0,
			to: existingLength,
			insert: "",
		});
	}
	ops.push({
		type: "splice-text",
		blockId: existingFirstId,
		from: 0,
		to: 0,
		insert: first,
	});
	let previousId = existingFirstId;
	for (let index = 1; index < paragraphs.length; index += 1) {
		const text = paragraphs[index];
		if (text === undefined) {
			throw new Error(`tenKWordFixture: missing paragraph ${index}`);
		}
		const blockId = tenKBlockId(index);
		ops.push({
			type: "insert-block",
			blockId,
			blockType: "paragraph",
			props: {},
			position: { after: previousId },
		});
		ops.push({
			type: "splice-text",
			blockId,
			from: 0,
			to: 0,
			insert: text,
		});
		previousId = blockId;
	}
	const cells = generateTenKCells();
	ops.push({
		type: "insert-block",
		blockId: TEN_K_TABLE_ID,
		blockType: "table",
		props: {},
		position: { after: previousId },
	});
	for (const cell of cells) {
		ops.push({
			type: "splice-text",
			blockId: TEN_K_TABLE_ID,
			cell: { row: cell.row, col: cell.col },
			from: 0,
			to: 0,
			insert: cell.text,
		});
	}
	return ops;
}