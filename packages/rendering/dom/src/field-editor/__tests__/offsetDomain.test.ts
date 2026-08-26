import { describe, expect, it } from "vitest";
import { logicalLength, toDomOffset, toLogicalOffset } from "../offsetDomain";

function expectInvertible(text: string): void {
	const logicalEnd = logicalLength(text);
	for (let logical = 0; logical <= logicalEnd; logical++) {
		expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
	}

	for (let dom = 0; dom <= text.length; dom++) {
		const logical = toLogicalOffset(dom, text);
		expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(logical);
	}
}

const STORAGE_SAMPLES = [
	"",
	"\u200B",
	"\u200B\u200B",
	"a\u200Bb",
	"hello",
	" ",
	"hi 👍",
	"日本語",
] as const;

const TRIALS = 256;
const ALPHABET = ["a", "b", " ", "0", "👍", "日", "\n", "\u200B"] as const;

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

describe("offsetDomain EM5 invertibility", () => {
	it("EM5: empty string has logical length 0 and maps invertibly", () => {
		expect(logicalLength("")).toBe(0);
		expect(toDomOffset(0, "")).toBe(0);
		expect(toLogicalOffset(0, "")).toBe(0);
		expect(toLogicalOffset(1, "")).toBe(0);
		expectInvertible("");
	});

	it("EM5: normal text maps invertibly", () => {
		const text = "hello";
		expect(logicalLength(text)).toBe(5);
		expect(toDomOffset(0, text)).toBe(0);
		expect(toDomOffset(5, text)).toBe(5);
		expect(toLogicalOffset(2, text)).toBe(2);
		expectInvertible(text);
	});

	it("EM5: emoji uses UTF-16 offsets; mid-string ZWSP is length 1", () => {
		const text = "hi 👍";
		expect(text.length).toBe(5);
		expect(logicalLength(text)).toBe(5);
		expect(toDomOffset(3, text)).toBe(3);
		expect(toLogicalOffset(5, text)).toBe(5);
		expectInvertible(text);

		const withZwsp = "a\u200Bb";
		expect(logicalLength(withZwsp)).toBe(3);
		expectInvertible(withZwsp);
	});
});

describe("offsetDomain EM5 storage samples and clamps", () => {
	it("EM5: empty string is length 0; mid-string ZWSP is real; clamps invert", () => {
		for (const text of STORAGE_SAMPLES) {
			expect(logicalLength(text)).toBe(text.length);

			const logicalEnd = logicalLength(text);
			for (let logical = 0; logical <= logicalEnd; logical++) {
				expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(
					logical,
				);
			}

			for (let dom = 0; dom <= text.length; dom++) {
				const logical = toLogicalOffset(dom, text);
				expect(logical).toBeGreaterThanOrEqual(0);
				expect(logical).toBeLessThanOrEqual(logicalEnd);
				expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(
					logical,
				);
			}

			expect(toDomOffset(-1, text)).toBe(0);
			expect(toLogicalOffset(-5, text)).toBe(0);
			expect(toDomOffset(text.length + 10, text)).toBe(logicalEnd);
			expect(toLogicalOffset(text.length + 10, text)).toBe(logicalEnd);
		}
	});
});

describe("offsetDomain EM5 properties", () => {
	it("EM5: empty string is length 0; mid-string ZWSP is real", () => {
		expect(logicalLength("")).toBe(0);
		expect(logicalLength("a\u200Bb")).toBe(3);
		const rng = mulberry32(0x49313100);
		for (let i = 0; i < TRIALS; i++) {
			const text = randomStorage(rng);
			const logicalEnd = text.length;

			expect(logicalLength(text)).toBe(logicalEnd);

			const offset = randomOffset(rng, text);
			const logical = toLogicalOffset(offset, text);
			const dom = toDomOffset(offset, text);
			expect(logical).toBeGreaterThanOrEqual(0);
			expect(logical).toBeLessThanOrEqual(logicalEnd);
			expect(dom).toBeGreaterThanOrEqual(0);
			expect(dom).toBeLessThanOrEqual(logicalEnd);
		}
	});

	it("EM5: toDomOffset and toLogicalOffset invert on the stored domain of random text", () => {
		const rng = mulberry32(0x49313102);
		for (let i = 0; i < TRIALS; i++) {
			const text = randomStorage(rng);
			const logicalEnd = logicalLength(text);
			for (let logical = 0; logical <= logicalEnd; logical++) {
				expect(toLogicalOffset(toDomOffset(logical, text), text)).toBe(
					logical,
				);
			}

			const offset = randomOffset(rng, text);
			const mapped = toLogicalOffset(offset, text);
			expect(toLogicalOffset(toDomOffset(mapped, text), text)).toBe(
				mapped,
			);
		}
	});
});
