import type { BenchDefinition } from "../bench";
import {
	SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH,
	SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH,
	SCALE3_KEYSTROKE_PEER_COUNT_8_BENCH,
} from "../constants/benchmarks";
import {
	SCALE3_DECORATION_COUNT_POINTS,
	SCALE3_DOCUMENT_SIZE_POINTS,
	SCALE3_EXTENSION_COUNT_POINTS,
	SCALE3_PEER_COUNT_POINTS,
	SCALE3_SHIPPED_STACK,
} from "../constants/scale3";
import {
	createScale3Editor,
	SCALE3_SHARED_POINT,
	scale3KeystrokeTarget,
} from "../fixtures/scale3Stack";

function createKeystrokeRunner(options: {
	blockCount: number;
	extraDecoratingExtensions?: number;
	decorationCount?: number;
	peerCount?: number;
	axis: string;
	axisPoint: number;
}): Pick<BenchDefinition, "fn" | "teardown"> {
	let editor: ReturnType<typeof createScale3Editor> | null = null;
	let offset = 0;
	const blockId = scale3KeystrokeTarget(options.blockCount);
	const extensionCount =
		SCALE3_SHIPPED_STACK.length + (options.extraDecoratingExtensions ?? 0);

	return {
		fn: (b) => {
			if (!editor) {
				editor = createScale3Editor({
					blockCount: options.blockCount,
					extraDecoratingExtensions: options.extraDecoratingExtensions,
					decorationCount: options.decorationCount,
					peerCount: options.peerCount,
				});
			}

			b.start();
			editor.apply(
				[
					{
						type: "insert-text",
						blockId,
						offset,
						text: "x",
					},
				],
				{ origin: "user" },
			);
			b.end();
			offset += 1;
			b.setMetrics({
				axis: options.axis,
				axisPoint: options.axisPoint,
				documentSize: options.blockCount,
				extensionCount,
				decorationCount: options.decorationCount ?? 0,
				peerCount: options.peerCount ?? 0,
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
		...createKeystrokeRunner({
			blockCount: SCALE3_DOCUMENT_SIZE_POINTS[0],
			axis: "document-size",
			axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[0],
		}),
	},
	{
		...SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH,
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			axis: "document-size",
			axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[1],
		}),
	},
	{
		...SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH,
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			extraDecoratingExtensions: 8,
			axis: "extension-count",
			axisPoint: SCALE3_EXTENSION_COUNT_POINTS[1],
		}),
	},
	{
		...SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH,
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			decorationCount: SCALE3_DECORATION_COUNT_POINTS[1],
			axis: "decoration-count",
			axisPoint: SCALE3_DECORATION_COUNT_POINTS[1],
		}),
	},
	{
		...SCALE3_KEYSTROKE_PEER_COUNT_8_BENCH,
		...createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			peerCount: SCALE3_PEER_COUNT_POINTS[1],
			axis: "peer-count",
			axisPoint: SCALE3_PEER_COUNT_POINTS[1],
		}),
	},
];
