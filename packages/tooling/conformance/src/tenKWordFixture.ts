import { createHash } from "node:crypto";
import type { DocumentOp } from "@input/pen-types";

/**
 * Wave 3.5 10k-word fixture. Deterministic: Numerical Recipes LCG with a
 * fixed seed walks a 32-word lexicon. Same seed + lexicon + shape always
 * produce the same paragraphs and the same SHA-256. A reviewer comparing
 * two baselines can tell a generator change (hash moves) from a scheduler
 * change (hash stable, numbers move).
 */
export const TEN_K_FIXTURE_ID = "wave3-10k-words";
export const TEN_K_SEED = 0x70656e33;
export const TEN_K_PARAGRAPH_COUNT = 20;
export const TEN_K_WORDS_PER_PARAGRAPH = 500;
export const TEN_K_WORD_COUNT =
	TEN_K_PARAGRAPH_COUNT * TEN_K_WORDS_PER_PARAGRAPH;
export const TEN_K_BLOCK_PREFIX = "w3-10k-p";

export const TEN_K_LEXICON = [
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
} as const;

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

export function tenKFixtureIdentity(paragraphs: readonly string[]): {
	id: string;
	wordCount: number;
	paragraphCount: number;
	contentSha256: string;
} {
	const joined = paragraphs.join("\n");
	const wordCount = paragraphs.reduce((count, paragraph) => {
		return (
			count +
			paragraph.split(" ").filter((word) => word.length > 0).length
		);
	}, 0);
	return {
		id: TEN_K_FIXTURE_ID,
		wordCount,
		paragraphCount: paragraphs.length,
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
			type: "delete-text",
			blockId: existingFirstId,
			offset: 0,
			length: existingLength,
		});
	}
	ops.push({
		type: "insert-text",
		blockId: existingFirstId,
		offset: 0,
		text: first,
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
			type: "insert-text",
			blockId,
			offset: 0,
			text,
		});
		previousId = blockId;
	}
	return ops;
}
