import type { BenchContext, BenchDefinition } from "../bench";
import type { DocumentOp, PenStreamPart, StreamingTarget } from "@input/pen-types";
import { deltaStreamExtension } from "@input/pen-ai/stream";
import { createTestEditor } from "@input/pen-test";
import {
	STREAMING_BATCH_FLUSH_LATENCY_BENCH,
	STREAMING_GEN_DELTA_1000_PARTS_BENCH,
} from "../constants/benchmarks";
import {
	assertGenDeltaPartsFeedClock,
	assertStreamingBlockReceivedDelta,
	consumeGenDeltaParts,
	generateGenDeltaParts,
} from "../fixtures/streamingParts";
import { macrotaskYieldFloor } from "../harness/floor";

function createStreamingBenchEditor() {
	return createTestEditor({
		blocks: [{ type: "paragraph" }],
		extensions: [deltaStreamExtension()],
	});
}

function getStreamingTarget(
	editor: ReturnType<typeof createTestEditor>,
): StreamingTarget {
	const streaming = editor.internals.getSlot<StreamingTarget>(
		"delta-stream:target",
	);
	if (!streaming) {
		throw new Error(
			"Streaming bench editor is missing the delta-stream target.",
		);
	}
	return streaming;
}

function countApplies(
	editor: ReturnType<typeof createTestEditor>,
): () => number {
	let applyCount = 0;
	const originalApply = editor.apply.bind(editor);
	editor.apply = ((ops: DocumentOp[], applyOptions) => {
		applyCount += 1;
		originalApply(ops, applyOptions);
	}) as typeof editor.apply;
	return () => applyCount;
}

// macrotask, not a microtask. 100 of these dominate the 1000-part clock.
function flushMacrotask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

export const STREAMING_GEN_DELTA_PARTS = 1000;
export const STREAMING_GEN_DELTA_YIELD_EVERY = 10;
export const STREAMING_GEN_DELTA_YIELDS = 100;
export const STREAMING_BATCH_FLUSH_YIELDS = 1;

export function createStreamingGenDeltaRunner(
	generateParts: (
		count: number,
		blockId: string,
	) => PenStreamPart[] = generateGenDeltaParts,
): Pick<BenchDefinition, "fn"> {
	return {
		async fn(b: BenchContext) {
			const editor = createStreamingBenchEditor();
			await editor.whenReady();
			const blockId = editor.document.blockOrder.get(0);
			const streaming = getStreamingTarget(editor);
			const applyCount = countApplies(editor);
			const parts = generateParts(STREAMING_GEN_DELTA_PARTS, blockId);
			const { lastDelta } = assertGenDeltaPartsFeedClock(
				parts,
				STREAMING_GEN_DELTA_PARTS,
			);

			b.start();
			const { deltaCount } = await consumeGenDeltaParts(
				streaming,
				parts,
				STREAMING_GEN_DELTA_YIELD_EVERY,
				flushMacrotask,
			);
			b.end();

			assertStreamingBlockReceivedDelta(
				blockId,
				editor.getBlock(blockId).textContent(),
				lastDelta,
			);
			b.observe("deltaCount", deltaCount, STREAMING_GEN_DELTA_PARTS);
			b.setMetrics({
				applyCount: applyCount(),
				yieldCount: STREAMING_GEN_DELTA_YIELDS,
				deltaCount,
				namedBlock: blockId,
			});
			await editor.destroy();
		},
	};
}

export const streamingBenchmarks: BenchDefinition[] = [
	{
		...STREAMING_GEN_DELTA_1000_PARTS_BENCH,
		floor: macrotaskYieldFloor(STREAMING_GEN_DELTA_YIELDS),
		fn: createStreamingGenDeltaRunner().fn,
	},
	{
		...STREAMING_BATCH_FLUSH_LATENCY_BENCH,
		floor: macrotaskYieldFloor(STREAMING_BATCH_FLUSH_YIELDS),
		fn: createStreamingBatchFlushRunner().fn,
	},
];

export function createStreamingBatchFlushRunner(
	options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
	return {
		async fn(b: BenchContext) {
			const editor = createStreamingBenchEditor();
			await editor.whenReady();
			const blockId = editor.document.blockOrder.get(0);
			const streaming = getStreamingTarget(editor);
			const applyCount = countApplies(editor);

			if (!options.skip) {
				streaming.beginStreaming("bench-flush", blockId);
				for (let i = 0; i < 49; i++) {
					streaming.appendDelta(`t${i} `);
				}
			}

			b.start();
			if (!options.skip) {
				streaming.appendDelta("final ");
				await flushMacrotask();
			}
			const timedApplyCount = options.skip ? 0 : applyCount();
			b.end();

			if (!options.skip) {
				streaming.endStreaming("complete");
			}
			const text = editor.getBlock(blockId).textContent();
			if (!options.skip && !text.includes("final ")) {
				throw new Error(
					`streaming batch-flush bench block ${blockId} missing "final ": ${JSON.stringify(text)}`,
				);
			}
			b.observe("applyCount", applyCount(), 1);
			b.setMetrics({ timedApplyCount, applyCount: applyCount() });
			await editor.destroy();
		},
	};
}
