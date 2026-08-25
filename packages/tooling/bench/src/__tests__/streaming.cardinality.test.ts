import { streamingTargetFacet } from "@input/pen-core";
import type { DocumentOp, StreamingTarget } from "@input/pen-types";
import { deltaStreamExtension } from "@input/pen-ai/stream";
import { createTestEditor } from "@input/pen-test";
import { afterEach, describe, expect, it } from "vitest";
import { runSuite } from "../bench";
import { STREAMING_GEN_DELTA_1000_PARTS_BENCH } from "../constants/benchmarks";
import {
	STREAMING_GEN_DELTA_YIELDS,
	streamingBenchmarks,
} from "../suites/streaming.bench";

const editors: Array<{ destroy: () => Promise<void> | void }> = [];

afterEach(async () => {
	while (editors.length > 0) {
		await editors.pop()!.destroy();
	}
});

async function createCountingEditor() {
	const editor = createTestEditor({
		blocks: [{ type: "paragraph" }],
		extensions: [deltaStreamExtension()],
	});
	editors.push(editor);
	await editor.whenReady();

	let applyCount = 0;
	const originalApply = editor.apply.bind(editor);
	editor.apply = ((ops: DocumentOp[], applyOptions) => {
		applyCount += 1;
		originalApply(ops, applyOptions);
	}) as typeof editor.apply;

	const streaming = editor.facet(streamingTargetFacet) as
		| StreamingTarget
		| null;
	if (!streaming) {
		throw new Error(
			"Streaming bench editor is missing the delta-stream target.",
		);
	}

	return {
		streaming,
		blockId: editor.document.blockOrder.get(0),
		applyCount: () => applyCount,
	};
}

describe("streaming bench apply cardinality", () => {
	it("coalesces 1000 appendDeltas into one apply when the flush window does not elapse", async () => {
		const { streaming, blockId, applyCount } = await createCountingEditor();

		streaming.beginStreaming("bench-zone", blockId);
		for (let i = 0; i < 1000; i++) {
			streaming.appendDelta(`token-${i} `);
		}
		expect(applyCount()).toBe(0);

		streaming.endStreaming("complete");
		expect(applyCount()).toBe(1);
	});

	it("does not apply 1000 times when the 1000-part harness yields macrotasks", async () => {
		const { streaming, blockId, applyCount } = await createCountingEditor();

		streaming.beginStreaming("bench-zone", blockId);
		for (let i = 0; i < 1000; i++) {
			streaming.appendDelta(`token-${i} `);
			if (i % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		streaming.endStreaming("complete");

		expect(applyCount()).toBeGreaterThanOrEqual(1);
		expect(applyCount()).toBeLessThan(1000);
	});

	it("does not apply inside the batch-flush timed window", async () => {
		const { streaming, blockId, applyCount } = await createCountingEditor();

		streaming.beginStreaming("bench-flush", blockId);
		for (let i = 0; i < 49; i++) {
			streaming.appendDelta(`t${i} `);
		}

		streaming.appendDelta("final ");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(applyCount()).toBe(0);

		streaming.endStreaming("complete");
		expect(applyCount()).toBe(1);
	});

	it("every streaming bench declares a Pen-removed floor", () => {
		expect(
			streamingBenchmarks.every((entry) => typeof entry.floor === "function"),
		).toBe(true);
	});

	it("the 1000-part floor records 100 yields and zero applies", async () => {
		const definition = streamingBenchmarks.find(
			(entry) => entry.id === STREAMING_GEN_DELTA_1000_PARTS_BENCH.id,
		);
		if (!definition) {
			throw new Error("streaming.gen-delta-1000-parts missing");
		}
		const [result] = await runSuite("streaming-floor", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.metrics).toMatchObject({
			floorApplyCount: 0,
			floorYieldCount: STREAMING_GEN_DELTA_YIELDS,
		});
		expect(typeof result?.floorP50Ms).toBe("number");
		expect(typeof result?.attributedP50Ms).toBe("number");
	});
});
