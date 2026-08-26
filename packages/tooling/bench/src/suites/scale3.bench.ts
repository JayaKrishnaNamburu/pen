import type { BenchDefinition } from "../bench";
import {
	SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH,
	SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH,
	SCALE3_KEYSTROKE_REMOTE_CARET_COUNT_8_BENCH,
} from "../constants/benchmarks";
import {
	SCALE3_DECORATION_COUNT_POINTS,
	SCALE3_DOCUMENT_SIZE_POINTS,
	SCALE3_EXTENSION_COUNT_POINTS,
	SCALE3_REMOTE_CARET_COUNT_POINTS,
	SCALE3_SHIPPED_STACK,
} from "../constants/scale3";
import {
	countScale3RemoteCarets,
	createScale3Editor,
	SCALE3_SHARED_POINT,
	scale3KeystrokeTarget,
} from "../fixtures/scale3Stack";

export function createKeystrokeRunner(options: {
	blockCount: number;
	extraDecoratingExtensions?: number;
	decorationCount?: number;
	remoteCaretCount?: number;
	axis: string;
	axisPoint: number;
	skip?: boolean;
	skipRemoteCarets?: boolean;
}): Pick<BenchDefinition, "fn" | "teardown"> {
	let editor: ReturnType<typeof createScale3Editor> | null = null;
	let offset = 0;
	const blockId = scale3KeystrokeTarget(options.blockCount);
	const extensionCount =
		SCALE3_SHIPPED_STACK.length + (options.extraDecoratingExtensions ?? 0);
	const expectedCarets = options.remoteCaretCount ?? 0;
	const installedCarets = options.skipRemoteCarets ? 0 : expectedCarets;

	return {
		fn: (b) => {
			if (!editor) {
				editor = createScale3Editor({
					blockCount: options.blockCount,
					extraDecoratingExtensions: options.extraDecoratingExtensions,
					decorationCount: options.decorationCount,
					remoteCaretCount: installedCarets,
				});
			}

			const before = editor.getBlock(blockId).textContent().length;
			b.start();
			if (!options.skip) {
				editor.apply(
					[
						{
							type: "splice-text",
							blockId,
							from: offset,
							to: offset,
							insert: "x",
						},
					],
					{ origin: "user" },
				);
			}
			b.end();
			if (expectedCarets > 0) {
				b.observe(
					"remoteCaretCount",
					countScale3RemoteCarets(editor),
					expectedCarets,
				);
			}
			b.observe(
				"insertedCharCount",
				editor.getBlock(blockId).textContent().length - before,
				1,
			);
			offset += 1;
			b.setMetrics({
				axis: options.axis,
				axisPoint: options.axisPoint,
				documentSize: options.blockCount,
				extensionCount,
				decorationCount: options.decorationCount ?? 0,
				remoteCaretCount: expectedCarets,
			});
		},
		teardown: async () => {
			if (!editor) {
				return;
			}
			await editor.destroy();
			editor = null;
		},
	};
}

export const scale3Benchmarks: BenchDefinition[] = [
	{
		...SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH,
		axis: "document-size",
		axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[0],
		...createKeystrokeRunner({
			blockCount: SCALE3_DOCUMENT_SIZE_POINTS[0],
			axis: "document-size",
			axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[0],
		}),
	},
	{
		...SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH,
		axis: "document-size",
		axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[1],
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			axis: "document-size",
			axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[1],
		}),
	},
	{
		...SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH,
		axis: "extension-count",
		axisPoint: SCALE3_EXTENSION_COUNT_POINTS[1],
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			extraDecoratingExtensions: 8,
			axis: "extension-count",
			axisPoint: SCALE3_EXTENSION_COUNT_POINTS[1],
		}),
	},
	{
		...SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH,
		axis: "decoration-count",
		axisPoint: SCALE3_DECORATION_COUNT_POINTS[1],
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			decorationCount: SCALE3_DECORATION_COUNT_POINTS[1],
			axis: "decoration-count",
			axisPoint: SCALE3_DECORATION_COUNT_POINTS[1],
		}),
	},
	{
		...SCALE3_KEYSTROKE_REMOTE_CARET_COUNT_8_BENCH,
		axis: "remote-caret-count",
		axisPoint: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			remoteCaretCount: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
			axis: "remote-caret-count",
			axisPoint: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
		}),
	},
];
