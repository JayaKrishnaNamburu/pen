import os from "node:os";
import type { BenchContext, BenchDefinition } from "../bench";
import {
	ANCHORS_ENCODE_SIZE_1000_BENCH,
	ANCHORS_RESOLVE_200_BLOCKS_BENCH,
	ANCHORS_RESOLVE_70K_1000_BENCH,
	ANCHORS_SPLIT_FOLLOW_BENCH,
} from "../constants/benchmarks";
import {
	ANCHOR_BLOCK_COUNT,
	ANCHOR_ENCODE_COUNT,
	SPLIT_HEAD_TEXT,
	SPLIT_TAIL_TEXT,
	ANCHOR_WORD,
	ANCHOR_WORD_REPEAT,
	createBlockScaleFixture,
	createPenShapedDoc,
	createScaleTextFixture,
	encodeSizes,
	insertBlockText,
	measureSplitFollow,
	mintEncoded,
	resolveEncoded,
} from "../fixtures/anchors";

function loadavg1(): number {
	return os.loadavg()[0] ?? 0;
}

function iterateEncodedFloor(count: number): (b: BenchContext) => void {
	return (b) => {
		b.start();
		let bytes = 0;
		for (let i = 0; i < count; i++) {
			bytes += i;
		}
		b.end();
		b.setMetrics({ walkCount: count, walkBytes: bytes });
	};
}

export const anchorsBenchmarks: BenchDefinition[] = [
	{
		...ANCHORS_ENCODE_SIZE_1000_BENCH,
		floor: iterateEncodedFloor(ANCHOR_ENCODE_COUNT),
		fn(b) {
			const { doc, blocks } = createPenShapedDoc();
			const text = ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT);
			const content = insertBlockText(doc, blocks, "b1", text);
			const encoded: Uint8Array[] = [];
			b.start();
			for (let i = 0; i < ANCHOR_ENCODE_COUNT; i++) {
				const offset = Math.floor((i / ANCHOR_ENCODE_COUNT) * text.length);
				encoded.push(mintEncoded(content, offset, 1));
			}
			b.end();
			const sizes = encodeSizes(encoded);
			if (sizes.count !== ANCHOR_ENCODE_COUNT) {
				throw new Error(
					`encode size bench minted ${sizes.count}, expected ${ANCHOR_ENCODE_COUNT}`,
				);
			}
			if (sizes.minBytes < 1) {
				throw new Error("encode size bench produced empty encodings");
			}
			b.setMetrics({
				encodeCount: sizes.count,
				minBytes: sizes.minBytes,
				p50Bytes: sizes.p50Bytes,
				p95Bytes: sizes.p95Bytes,
				maxBytes: sizes.maxBytes,
				charCount: text.length,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_RESOLVE_70K_1000_BENCH,
		floor: iterateEncodedFloor(ANCHOR_ENCODE_COUNT),
		fn(b) {
			const fixture = createScaleTextFixture();
			b.start();
			const resolved = fixture.encoded.map((encoded) =>
				resolveEncoded(fixture.doc, encoded),
			);
			b.end();
			if (resolved.length !== ANCHOR_ENCODE_COUNT) {
				throw new Error(
					`resolve 70k bench resolved ${resolved.length}, expected ${ANCHOR_ENCODE_COUNT}`,
				);
			}
			for (let i = 0; i < resolved.length; i++) {
				const point = resolved[i]!;
				if (point.index !== fixture.offsets[i]) {
					throw new Error(
						`resolve 70k bench index ${point.index} !== mint ${fixture.offsets[i]} at ${i}`,
					);
				}
				if (point.type !== fixture.content) {
					throw new Error("resolve 70k bench left its Y.Text");
				}
			}
			b.setMetrics({
				resolveCount: resolved.length,
				charCount: fixture.text.length,
				nullCount: 0,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_RESOLVE_200_BLOCKS_BENCH,
		floor: iterateEncodedFloor(ANCHOR_BLOCK_COUNT),
		fn(b) {
			const fixture = createBlockScaleFixture();
			b.start();
			const resolved = fixture.encoded.map((encoded) =>
				resolveEncoded(fixture.doc, encoded),
			);
			b.end();
			if (resolved.length !== ANCHOR_BLOCK_COUNT) {
				throw new Error(
					`resolve 200-block bench resolved ${resolved.length}, expected ${ANCHOR_BLOCK_COUNT}`,
				);
			}
			if (resolved.some((point) => point.index !== 0 || point.type == null)) {
				throw new Error("resolve 200-block bench missed a mint-at-0");
			}
			b.setMetrics({
				resolveCount: resolved.length,
				blockCount: fixture.blockIds.length,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_SPLIT_FOLLOW_BENCH,
		floor: iterateEncodedFloor(4),
		fn(b) {
			b.start();
			const measured = measureSplitFollow();
			b.end();
			if (measured.sourceText !== SPLIT_HEAD_TEXT) {
				throw new Error(
					`split bench source is ${JSON.stringify(measured.sourceText)}, expected ${SPLIT_HEAD_TEXT}`,
				);
			}
			if (measured.destText !== SPLIT_TAIL_TEXT) {
				throw new Error(
					`split bench dest is ${JSON.stringify(measured.destText)}, expected ${SPLIT_TAIL_TEXT}`,
				);
			}
			const tail = measured.results.find((result) => result.name === "tail");
			if (!tail?.stuckOnSource) {
				throw new Error("split bench tail followed the copy; substrate changed");
			}
			b.setMetrics({
				stuckCount: measured.stuckCount,
				followedCount: measured.followedCount,
				v2MismatchCount: measured.v2MismatchCount,
				sourceChars: measured.sourceText.length,
				destChars: measured.destText.length,
				loadavg1: loadavg1(),
			});
		},
	},
];
