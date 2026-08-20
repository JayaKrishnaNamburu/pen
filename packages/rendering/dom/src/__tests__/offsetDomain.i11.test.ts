import { describe, expect, it } from "vitest";
import {
	logicalLength,
	toDomOffset,
	toLogicalOffset,
} from "../field-editor/offsetDomain";

const EMPTY_BLOCK_SENTINEL = "\u200B";
const TRIALS = 256;
const ALPHABET = [
	"a",
	"b",
	" ",
	"0",
	"👍",
	"日",
	"\n",
	EMPTY_BLOCK_SENTINEL,
] as const;

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a += 0x6d2b79f5;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomStorage(rng: () => number): string {
	const kind = rng();
	if (kind < 0.1) {
		return "";
	}
	if (kind < 0.25) {
		return EMPTY_BLOCK_SENTINEL;
	}
	const length = Math.floor(rng() * 16);
	let text = "";
	for (let i = 0; i < length; i++) {
		text += ALPHABET[Math.floor(rng() * ALPHABET.length)]!;
	}
	return text;
}

function randomOffset(rng: () => number, text: string): number {
	const kind = rng();
	if (kind < 0.2) {
		return -1 - Math.floor(rng() * 32);
	}
	if (kind < 0.4) {
		return text.length + 1 + Math.floor(rng() * 32);
	}
	if (text.length === 0) {
		return 0;
	}
	return Math.floor(rng() * (text.length + 1));
}

function expectedLogicalLength(text: string): number {
	return text === EMPTY_BLOCK_SENTINEL ? 0 : text.length;
}

describe("offsetDomain I11 properties", () => {
	it("I11: U+200B not in logical domain", () => {
		const rng = mulberry32(0x49313100);
		for (let i = 0; i < TRIALS; i++) {
			const text = randomStorage(rng);
			const logicalEnd = expectedLogicalLength(text);

			expect(logicalLength(text)).toBe(logicalEnd);

			if (text === EMPTY_BLOCK_SENTINEL) {
				expect(logicalEnd).toBe(0);
				for (let dom = 0; dom <= text.length; dom++) {
					expect(toLogicalOffset(dom, text)).toBe(0);
				}
				expect(toDomOffset(0, text)).toBe(0);
				expect(toDomOffset(1, text)).toBe(0);
			}

			const offset = randomOffset(rng, text);
			const logical = toLogicalOffset(offset, text);
			const dom = toDomOffset(offset, text);
			expect(logical).toBeGreaterThanOrEqual(0);
			expect(logical).toBeLessThanOrEqual(logicalEnd);
			expect(dom).toBeGreaterThanOrEqual(0);
			expect(dom).toBeLessThanOrEqual(logicalEnd);
		}
	});

	it("I11: U+200B empty-block sentinel never occupies a logical offset under random mapping", () => {
		const rng = mulberry32(0x49313101);
		for (let i = 0; i < TRIALS; i++) {
			const text = randomStorage(rng);
			const logicalEnd = logicalLength(text);
			const offset = randomOffset(rng, text);
			const logical = toLogicalOffset(offset, text);

			expect(logical).toBeLessThanOrEqual(logicalEnd);
			if (text === EMPTY_BLOCK_SENTINEL) {
				expect(logical).toBe(0);
				expect(toDomOffset(offset, text)).toBe(0);
			}
		}
	});

	it("I11: toDomOffset and toLogicalOffset invert on the logical domain of random storage", () => {
		const rng = mulberry32(0x49313102);
		for (let i = 0; i < TRIALS; i++) {
			const text = randomStorage(rng);
			const logicalEnd = logicalLength(text);
			for (let logical = 0; logical <= logicalEnd; logical++) {
				expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
			}

			const offset = randomOffset(rng, text);
			const mapped = toLogicalOffset(offset, text);
			expect(toLogicalOffset(toDomOffset(mapped, text), text)).toBe(mapped);
		}
	});
});
