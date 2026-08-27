import { yjsAdapter } from "@input/pen-yjs";
import type { YjsCRDTDocument } from "@input/pen-yjs";
import * as Y from "yjs";
import { createLargeDocument } from "./largeDoc";

export const FORK_MERGE_BLOCK_COUNT = 100;
export const FORK_MERGE_BLOCK_ID = "block-50";
export const FORK_MERGE_TOKEN = "FORK-MERGE-TOKEN";

export function readBlockText(
	doc: YjsCRDTDocument,
	blockId: string,
): string {
	const blockMap = doc.penDocument.blocks.get(blockId);
	const content = blockMap?.get("content");
	if (content instanceof Y.Text) {
		return content.toString();
	}
	return "";
}

export function insertBlockToken(
	adapter: ReturnType<typeof yjsAdapter>,
	doc: YjsCRDTDocument,
	blockId: string,
	token: string,
): void {
	adapter.transact(doc, () => {
		const blockMap = doc.penDocument.blocks.get(blockId);
		const content = blockMap?.get("content");
		if (!(content instanceof Y.Text)) {
			throw new Error(`fork-merge named block ${blockId} has no Y.Text`);
		}
		content.insert(0, token);
	});
}

/**
 * The fork-merge bench is only a measurement after the fork holds a
 * token the target does not. Merging a fork into itself is a no-op.
 */
export function assertForkDiverged(
	target: YjsCRDTDocument,
	fork: YjsCRDTDocument,
	blockId: string,
	token: string,
): void {
	const targetText = readBlockText(target, blockId);
	if (targetText.includes(token)) {
		throw new Error(
			`observation token already present on target block ${blockId} before merge`,
		);
	}
	const forkText = readBlockText(fork, blockId);
	if (!forkText.includes(token)) {
		throw new Error(
			`fork block ${blockId} is missing ${token}; documents did not diverge`,
		);
	}
}

/**
 * Post-merge observation of a named insert. The CRDT timed path uses
 * this after the clock so a no-op merge cannot publish.
 */
export function assertMergeTransferred(
	target: YjsCRDTDocument,
	blockId: string,
	token: string,
): void {
	const after = readBlockText(target, blockId);
	if (!after.includes(token)) {
		throw new Error(
			`merge did not transfer ${token} onto target block ${blockId}: ${JSON.stringify(after)}`,
		);
	}
}

export function createDivergedFork(blockCount = FORK_MERGE_BLOCK_COUNT): {
	adapter: ReturnType<typeof yjsAdapter>;
	doc: YjsCRDTDocument;
	forked: YjsCRDTDocument;
} {
	const { doc, adapter } = createLargeDocument(blockCount);
	if (typeof adapter.fork !== "function" || typeof adapter.merge !== "function") {
		throw new Error("crdt.fork-merge-100 requires adapter.fork and adapter.merge");
	}
	const forked = adapter.fork(doc) as YjsCRDTDocument;
	insertBlockToken(adapter, forked, FORK_MERGE_BLOCK_ID, FORK_MERGE_TOKEN);
	assertForkDiverged(doc, forked, FORK_MERGE_BLOCK_ID, FORK_MERGE_TOKEN);
	return { adapter, doc, forked };
}
