import { describe, expect, it } from "vitest";
import { attributeBenchResult, runSuite } from "../bench";
import {
	ANCHORS_ENCODE_SIZE_1000_BENCH,
	ANCHORS_RESOLVE_200_BLOCKS_BENCH,
	ANCHORS_RESOLVE_70K_1000_BENCH,
	ANCHORS_SPLIT_FOLLOW_BENCH,
} from "../constants/benchmarks";
import {
	ANCHOR_BLOCK_COUNT,
	ANCHOR_ENCODE_COUNT,
	ANCHOR_WORD,
	ANCHOR_WORD_REPEAT,
	SPLIT_HEAD_TEXT,
	SPLIT_OFFSET,
	SPLIT_SOURCE_TEXT,
	SPLIT_TAIL_TEXT,
	createBlockScaleFixture,
	createPenShapedDoc,
	createScaleTextFixture,
	encodeSizes,
	insertBlockText,
	measureSplitFollow,
	mintEncoded,
	resolveEncoded,
} from "../fixtures/anchors";
import { anchorsBenchmarks } from "../suites/anchors.bench";

describe("Yjs relative-position substrate", () => {
	it("every anchors bench declares a Pen-removed floor", () => {
		expect(anchorsBenchmarks.length).toBe(4);
		expect(
			anchorsBenchmarks.every((entry) => typeof entry.floor === "function"),
		).toBe(true);
	});

	it("encode size is a 4–6 byte count, not a clock", () => {
		const fixture = createScaleTextFixture();
		expect(fixture.text).toBe(ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT));
		expect(fixture.text.length).toBe(70_000);
		expect(fixture.encoded).toHaveLength(ANCHOR_ENCODE_COUNT);
		const sizes = encodeSizes(fixture.encoded);
		expect(sizes.count).toBe(ANCHOR_ENCODE_COUNT);
		expect(sizes.minBytes).toBeGreaterThanOrEqual(4);
		expect(sizes.maxBytes).toBeLessThanOrEqual(6);
		expect(sizes.p50Bytes).toBeGreaterThanOrEqual(sizes.minBytes);
		expect(sizes.p95Bytes).toBeLessThanOrEqual(sizes.maxBytes);
	});

	it("a live random clientID encodes larger than the case-0 item id", () => {
		const { doc, blocks } = createPenShapedDoc(0x24d3a198);
		const content = insertBlockText(doc, blocks, "b1", ANCHOR_WORD.repeat(100));
		const encoded = mintEncoded(content, 50, 1);
		expect(encoded.byteLength).toBeGreaterThan(6);
	});

	it("encodeSizes refuses an empty population", () => {
		expect(() => encodeSizes([])).toThrow(/empty population/);
	});

	it("resolve at 70k chars returns the minted offsets", () => {
		const fixture = createScaleTextFixture();
		const resolved = fixture.encoded.map((encoded) =>
			resolveEncoded(fixture.doc, encoded),
		);
		expect(resolved).toHaveLength(ANCHOR_ENCODE_COUNT);
		for (let i = 0; i < resolved.length; i++) {
			expect(resolved[i]?.index).toBe(fixture.offsets[i]);
			expect(resolved[i]?.type).toBe(fixture.content);
		}
	});

	it("resolve across 200 blocks hits mint-at-0 on each type", () => {
		const fixture = createBlockScaleFixture();
		expect(fixture.blockIds).toHaveLength(ANCHOR_BLOCK_COUNT);
		const resolved = fixture.encoded.map((encoded) =>
			resolveEncoded(fixture.doc, encoded),
		);
		expect(resolved.every((point) => point.index === 0 && point.type != null)).toBe(
			true,
		);
	});

	it("Pen copy-split leaves tail and assoc-1 split point stuck on the source", () => {
		const measured = measureSplitFollow();
		expect(measured.sourceText).toBe(SPLIT_HEAD_TEXT);
		expect(measured.destText).toBe(SPLIT_TAIL_TEXT);
		expect(SPLIT_SOURCE_TEXT.slice(0, SPLIT_OFFSET)).toBe(SPLIT_HEAD_TEXT);
		expect(SPLIT_SOURCE_TEXT.slice(SPLIT_OFFSET)).toBe(SPLIT_TAIL_TEXT);

		const byName = Object.fromEntries(
			measured.results.map((result) => [result.name, result]),
		);
		expect(byName.head).toMatchObject({
			resolvedIndex: 3,
			onSource: true,
			matchesV2: true,
			stuckOnSource: false,
		});
		expect(byName["split-assoc-minus1"]).toMatchObject({
			resolvedIndex: SPLIT_OFFSET,
			onSource: true,
			matchesV2: true,
			stuckOnSource: false,
		});
		expect(byName["split-assoc-plus1"]).toMatchObject({
			onSource: true,
			onDest: false,
			matchesV2: false,
			stuckOnSource: true,
		});
		expect(byName.tail).toMatchObject({
			resolvedIndex: SPLIT_OFFSET,
			onSource: true,
			onDest: false,
			matchesV2: false,
			stuckOnSource: true,
		});
		expect(measured.stuckCount).toBe(2);
		expect(measured.followedCount).toBe(2);
		expect(measured.v2MismatchCount).toBe(2);
	});

	it("timed benches attribute a floor and keep the post-clock counts", async () => {
		const [result] = await runSuite(
			"anchors-floor",
			anchorsBenchmarks.filter(
				(entry) => entry.id === ANCHORS_SPLIT_FOLLOW_BENCH.id,
			),
			{ iterations: 1, warmup: 0 },
		);
		expect(typeof result?.floorP50Ms).toBe("number");
		expect(typeof result?.attributedP50Ms).toBe("number");
		expect(result?.attributedP50Ms).toBe(attributeBenchResult(result!));
		expect(result?.metrics).toMatchObject({
			stuckCount: 2,
			followedCount: 2,
			v2MismatchCount: 2,
			sourceChars: SPLIT_HEAD_TEXT.length,
			destChars: SPLIT_TAIL_TEXT.length,
		});
	});

	it("encode and resolve benches record counts after the clock", async () => {
		const results = await runSuite(
			"anchors-counts",
			anchorsBenchmarks.filter((entry) =>
				[
					ANCHORS_ENCODE_SIZE_1000_BENCH.id,
					ANCHORS_RESOLVE_70K_1000_BENCH.id,
					ANCHORS_RESOLVE_200_BLOCKS_BENCH.id,
				].includes(entry.id ?? ""),
			),
			{ iterations: 1, warmup: 0 },
		);
		const byId = Object.fromEntries(
			results.map((result) => [result.id, result]),
		);
		expect(byId["anchors.encode-size-1000"]?.metrics).toMatchObject({
			encodeCount: ANCHOR_ENCODE_COUNT,
			charCount: 70_000,
		});
		expect(byId["anchors.resolve-70k-1000"]?.metrics).toMatchObject({
			resolveCount: ANCHOR_ENCODE_COUNT,
			nullCount: 0,
		});
		expect(byId["anchors.resolve-200-blocks"]?.metrics).toMatchObject({
			resolveCount: ANCHOR_BLOCK_COUNT,
			blockCount: ANCHOR_BLOCK_COUNT,
		});
		for (const result of results) {
			expect(typeof result.floorP50Ms).toBe("number");
			expect(typeof result.attributedP50Ms).toBe("number");
		}
	});
});
