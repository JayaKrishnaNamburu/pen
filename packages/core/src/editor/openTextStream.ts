import type {
	CommitEvent,
	DocumentOp,
	Editor,
	OpenTextStreamOptions,
	OpOrigin,
	Point,
	StreamOpenOp,
	TextStreamWriter,
} from "@input/pen-types";

import { createTextStreamWriter, resolveStreamOrigin } from "./textStream";

export interface OpenTextStreamHost {
	runBeforeApplyHooks(ops: DocumentOp[], origin: OpOrigin): DocumentOp[];
	deferBlock(blockId: string): void;
	undeferBlock(blockId: string): void;
}

function createRejectedWriter(point: Point): TextStreamWriter {
	return {
		get position() {
			return point;
		},
		append() {},
		splice() {},
		flush() {},
		close() {},
		abort() {},
	};
}

function blockWriteHead(editor: Editor, blockId: string): Point {
	return {
		blockId,
		offset: editor.getBlock(blockId)?.length() ?? 0,
	};
}

export function openEditorTextStream(
	editor: Editor,
	target: { blockId: string },
	options: OpenTextStreamOptions,
	host: OpenTextStreamHost,
): TextStreamWriter {
	const origin = resolveStreamOrigin(options.origin);
	const streamOpen: StreamOpenOp = {
		type: "stream-open",
		blockId: target.blockId,
	};
	const afterHooks = host.runBeforeApplyHooks([streamOpen], origin);
	if (!afterHooks.some((op) => op.type === "stream-open")) {
		return createRejectedWriter(blockWriteHead(editor, target.blockId));
	}

	editor.undoManager.stopCapturing();

	const deferNormalization = options.deferNormalization ?? true;
	if (deferNormalization) {
		host.deferBlock(target.blockId);
	}

	let writeHead = blockWriteHead(editor, target.blockId);
	const unsubscribe = editor.on("commit", (event: CommitEvent) => {
		const mapped = event.summary.mapPoint(writeHead);
		if (mapped) {
			writeHead = mapped;
		}
	});

	return createTextStreamWriter({
		apply: (ops, applyOptions) => {
			editor.apply(ops, applyOptions);
		},
		getPoint: () => writeHead,
		origin,
		flushIntervalMs: options.flushIntervalMs,
		deferNormalization,
		onClose: ({ deferNormalization: shouldUndefer }) => {
			unsubscribe();
			if (shouldUndefer) {
				host.undeferBlock(target.blockId);
			}
			editor.undoManager.stopCapturing();
		},
	});
}
