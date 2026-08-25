import type { BenchContext, BenchDefinition } from "../bench";
import { decorationsFacet, emptyDecorationSet } from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import { defineExtension } from "@input/pen-core";
import {
	EXTENSION_COLLECT_DECORATIONS_X5_BENCH,
	EXTENSION_DISPATCH_OBSERVE_X5_BENCH,
} from "../constants/benchmarks";

export const DECORATION_REFRESH_ITERATIONS = 250;
const INSERTED_TEXT = "benchmark text";

function makeNoopExtension(name: string) {
	return defineExtension({
		name,
		observe(_events, _editor) {
			// intentional no-op for dispatch overhead measurement
		},
		facets: [decorationsFacet.of(() => emptyDecorationSet())],
	});
}

function createTestEditorWithExtensions(count: number) {
	const extensions = Array.from({ length: count }, (_, i) =>
		makeNoopExtension(`bench-ext-${i}`),
	);
	return createTestEditor({
		extensions,
		blocks: [{ type: "paragraph", content: "benchmark content" }],
	});
}

export function createDispatchObserveRunner(
	options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
	return {
		async fn(b: BenchContext) {
			const editor = createTestEditorWithExtensions(5);
			const blockId = editor.document.blockOrder.get(0);
			const before = editor.getBlock(blockId).textContent().length;

			b.start();
			if (!options.skip) {
				editor.apply([
					{
						type: "splice-text",
						blockId,
						from: 0,
				to: 0,
				insert: INSERTED_TEXT,
					},
				]);
			}
			b.end();
			b.observe(
				"insertedCharCount",
				editor.getBlock(blockId).textContent().length - before,
				INSERTED_TEXT.length,
			);
			await editor.destroy();
		},
	};
}

export function createCollectDecorationsRunner(
	options: { skip?: boolean } = {},
): Pick<BenchDefinition, "fn"> {
	return {
		async fn(b: BenchContext) {
			const editor = createTestEditorWithExtensions(5);
			let refreshCount = 0;

			b.start();
			if (!options.skip) {
				for (let i = 0; i < DECORATION_REFRESH_ITERATIONS; i++) {
					editor.requestDecorationUpdate();
					editor.getDecorations();
					refreshCount += 1;
				}
			}
			b.end();
			b.observe("refreshCount", refreshCount, DECORATION_REFRESH_ITERATIONS);
			b.setMetrics({ refreshCount });
			await editor.destroy();
		},
	};
}

export const extensionBenchmarks: BenchDefinition[] = [
	{
		...EXTENSION_DISPATCH_OBSERVE_X5_BENCH,
		fn: createDispatchObserveRunner().fn,
	},
	{
		...EXTENSION_COLLECT_DECORATIONS_X5_BENCH,
		fn: createCollectDecorationsRunner().fn,
	},
];
