import type { BenchDefinition } from "../bench";
import type { DocumentOp, StreamingTarget } from "@input/pen-types";
import { deltaStreamExtension } from "@input/pen-delta-stream";
import { createTestEditor } from "@input/pen-test";
import {
	STREAMING_BATCH_FLUSH_LATENCY_BENCH,
	STREAMING_GEN_DELTA_1000_PARTS_BENCH,
} from "../constants/benchmarks";

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

export const streamingBenchmarks: BenchDefinition[] = [
	{
		...STREAMING_GEN_DELTA_1000_PARTS_BENCH,
		async fn(b) {
			const editor = createStreamingBenchEditor();
			await editor.whenReady();
			const blockId = editor.document.blockOrder.get(0);
			const streaming = getStreamingTarget(editor);
			const applyCount = countApplies(editor);

			b.start();

			const zoneId = "bench-zone";
			streaming.beginStreaming(zoneId, blockId);

			for (let i = 0; i < 1000; i++) {
				streaming.appendDelta(`token-${i} `);
				if (i % 10 === 0) {
					await flushMacrotask();
				}
			}

			streaming.endStreaming("complete");
			b.end();
			b.setMetrics({ applyCount: applyCount() });
			await editor.destroy();
		},
	},
	{
		...STREAMING_BATCH_FLUSH_LATENCY_BENCH,
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
