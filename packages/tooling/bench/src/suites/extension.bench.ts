import type { BenchContext, BenchDefinition } from "../bench";
import { emptyDecorationSet } from "@pen/core";
import { createTestEditor } from "@pen/test";
import { defineExtension } from "@pen/types";
import {
	EXTENSION_COLLECT_DECORATIONS_X5_BENCH,
	EXTENSION_DISPATCH_OBSERVE_X5_BENCH,
} from "../constants/benchmarks";

const DECORATION_REFRESH_ITERATIONS = 250;

function makeNoopExtension(name: string) {
	return defineExtension({
		name,
		observe(_events, _editor) {
			// intentional no-op for dispatch overhead measurement
		},
		decorations(_state, _editor) {
			return emptyDecorationSet();
		},
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

export const extensionBenchmarks: BenchDefinition[] = [
	{
		...EXTENSION_DISPATCH_OBSERVE_X5_BENCH,
		fn(b) {
			const editor = createTestEditorWithExtensions(5);
			const blockId = editor.document.blockOrder.get(0);

			b.start();
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "benchmark text",
				},
			]);
			b.end();
		},
	},
	{
		...EXTENSION_COLLECT_DECORATIONS_X5_BENCH,
		fn(b) {
			const editor = createTestEditorWithExtensions(5);

			b.start();
			for (let i = 0; i < DECORATION_REFRESH_ITERATIONS; i++) {
				editor.requestDecorationUpdate();
			}
			b.end();
			b.setMetrics({ refreshCount: DECORATION_REFRESH_ITERATIONS });
		},
	},
];
