import type {
	Anchor,
	CommitEvent,
	DocumentOp,
	Editor,
	OpenTextStreamOptions,
	OpOrigin,
	Point,
	StreamOpenOp,
	TextStreamWriter,
} from "@input/pen-types";

import { deriveContentMoves, repairAnchor } from "./anchorRepair";
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

function pointOf(target: { blockId: string; offset: number }): Point {
	return { blockId: target.blockId, offset: target.offset };
}

function blockStillPresent(editor: Editor, ...blockIds: string[]): boolean {
	return blockIds.some((blockId) => editor.getBlock(blockId) != null);
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
	let head: Anchor | null = editor.anchors.create(writeHead, 1);
	if (!head) {
		if (deferNormalization) {
			host.undeferBlock(target.blockId);
		}
		editor.undoManager.stopCapturing();
		return createRejectedWriter(writeHead);
	}
	let blockGone = false;
	let lengthAtHead = editor.getBlock(writeHead.blockId)?.length() ?? 0;

	function rememberLength(): void {
		lengthAtHead = editor.getBlock(writeHead.blockId)?.length() ?? lengthAtHead;
	}

	function summaryTouchesHead(summary: CommitEvent["summary"]): boolean {
		if (!head) {
			return false;
		}
		const headBlockId = head.blockId;
		if (
			summary.text.some(
				(change) =>
					change.blockId === writeHead.blockId || change.blockId === headBlockId,
			)
		) {
			return true;
		}
		return summary.structural.some(
			(change) =>
				change.type === "block-removed" &&
				(change.blockId === writeHead.blockId || change.blockId === headBlockId),
		);
	}

	function attachIfStuck(resolved: { blockId: string; offset: number }): void {
		if (!head) {
			return;
		}
		const length = editor.getBlock(resolved.blockId)?.length() ?? 0;
		if (writeHead.offset !== lengthAtHead || length <= lengthAtHead) {
			return;
		}
		if (
			resolved.blockId !== writeHead.blockId ||
			resolved.offset !== writeHead.offset
		) {
			return;
		}
		const next = { blockId: resolved.blockId, offset: length };
		const reminted = editor.anchors.create(next, 1);
		if (!reminted) {
			return;
		}
		head = reminted;
		writeHead = next;
	}

	function syncHead(summary: CommitEvent["summary"]): void {
		if (!head || blockGone) {
			return;
		}
		const moves = deriveContentMoves(summary, undefined);
		const previous = head;
		head = repairAnchor(editor, head, moves);
		if (head === previous && moves.length === 0 && !summaryTouchesHead(summary)) {
			return;
		}
		const resolved = editor.anchors.resolve(head);
		if (resolved) {
			if (
				resolved.blockId !== writeHead.blockId ||
				resolved.offset !== writeHead.offset
			) {
				writeHead = pointOf(resolved);
			} else {
				attachIfStuck(resolved);
			}
			rememberLength();
			return;
		}
		if (blockStillPresent(editor, head.blockId, writeHead.blockId)) {
			return;
		}
		blockGone = true;
	}

	let lastSummaryCommitId = Number.NaN;
	const unsubscribe = editor.on("commit", (event: CommitEvent) => {
		if (event.summary.commitId === lastSummaryCommitId) {
			return;
		}
		lastSummaryCommitId = event.summary.commitId;
		syncHead(event.summary);
	});

	return createTextStreamWriter({
		apply: (ops, applyOptions) => {
			if (blockGone) {
				return;
			}
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
