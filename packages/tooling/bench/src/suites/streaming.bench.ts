import type { BenchContext, BenchDefinition } from "../bench";
import type { DocumentOp, PenStreamPart, StreamingTarget } from "@input/pen-types";
import { deltaStreamExtension } from "@input/pen-delta-stream";
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
		async fn(b) {
			const editor = createStreamingBenchEditor();
			await editor.whenReady();
			const blockId = editor.document.blockOrder.get(0);
			const streaming = getStreamingTarget(editor);
			const applyCount = countApplies(editor);

			streaming.beginStreaming("bench-flush", blockId);

			for (let i = 0; i < 49; i++) {
				streaming.appendDelta(`t${i} `);
			}

			b.start();
			streaming.appendDelta("final ");
			await flushMacrotask();
			const timedApplyCount = applyCount();
			b.end();

			streaming.endStreaming("complete");
			b.setMetrics({ timedApplyCount, applyCount: applyCount() });
			await editor.destroy();
		},
	},
];
