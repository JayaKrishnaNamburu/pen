import {
	formatBlocksAsAnnotatedMarkdown,
	resolveDocumentBlocks,
	summarizeBlocks,
} from "@input/pen-document-ops";
import type { Editor } from "@input/pen-types";
import type { AIWorkingSetViewMode } from "./contracts";

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const FNV64_MASK = 0xffffffffffffffffn;

/**
 * FNV-1a 64-bit, hex. Change detector for the model's rendered view — not a
 * security primitive. No shared hasher exists in this package.
 */
function hashRenderedView(value: string): string {
	let hash = FNV64_OFFSET;
	for (let index = 0; index < value.length; index++) {
		hash ^= BigInt(value.charCodeAt(index));
		hash = (hash * FNV64_PRIME) & FNV64_MASK;
	}
	return hash.toString(16).padStart(16, "0");
}

export function renderTrackedBlockView(
	editor: Editor,
	blockId: string,
	viewMode: AIWorkingSetViewMode,
): string {
	const snapshots = resolveDocumentBlocks(
		editor,
		{ startBlockId: blockId, endBlockId: blockId },
		viewMode,
	);
	const snapshot = snapshots.find((block) => block.id === blockId);
	if (!snapshot) {
		return "";
	}
	return formatBlocksAsAnnotatedMarkdown([snapshot]);
}

export function captureBlockViewHashes(
	editor: Editor,
	blockIds: readonly string[],
	viewMode: AIWorkingSetViewMode,
): Record<string, string> {
	const hashes: Record<string, string> = {};
	for (const blockId of blockIds) {
		hashes[blockId] = hashRenderedView(
			renderTrackedBlockView(editor, blockId, viewMode),
		);
	}
	return hashes;
}

export function viewHashesChanged(
	trackedBlockIds: readonly string[],
	recorded: Record<string, string> | undefined,
	current: Record<string, string>,
): boolean {
	if (!recorded) {
		return false;
	}
	return trackedBlockIds.some(
		(blockId) =>
			recorded[blockId] != null && recorded[blockId] !== current[blockId],
	);
}

export interface StaleEditDocumentRefusal {
	ok: false;
	appliedOperations: [];
	rejected: Array<{ index: number; operation: string; reason: string }>;
	outline: Array<{ blockId: string; blockType: string; preview: string }>;
	hint: string;
}

function readEditOperations(input: unknown): Array<Record<string, unknown>> {
	const operations = (input as { operations?: unknown } | null)?.operations;
	if (!Array.isArray(operations)) {
		return [];
	}
	return operations.filter(
		(operation): operation is Record<string, unknown> =>
			operation != null &&
			typeof operation === "object" &&
			!Array.isArray(operation),
	);
}

function targetIdsFromOperation(operation: Record<string, unknown>): string[] {
	const ids: string[] = [];
	if (typeof operation.blockId === "string") {
		ids.push(operation.blockId);
	}
	if (typeof operation.referenceBlockId === "string") {
		ids.push(operation.referenceBlockId);
	}
	if (Array.isArray(operation.blockIds)) {
		for (const id of operation.blockIds) {
			if (typeof id === "string") {
				ids.push(id);
			}
		}
	}
	return ids;
}

function buildLiveOutline(
	editor: Editor,
): StaleEditDocumentRefusal["outline"] {
	return summarizeBlocks(
		resolveDocumentBlocks(editor, null, "resolved"),
	).map((block) => ({
		blockId: block.id,
		blockType: block.type,
		preview: block.preview,
	}));
}

/**
 * EC5/EC9: refuse `edit_document` against a target whose rendered view
 * changed since the working-set read. Does not execute the tool.
 */
export function refuseStaleEditDocumentCall(
	editor: Editor,
	input: unknown,
	recordedViewHashes: Record<string, string> | undefined,
	viewMode: AIWorkingSetViewMode,
): StaleEditDocumentRefusal | null {
	if (!recordedViewHashes) {
		return null;
	}
	const operations = readEditOperations(input);
	const rejected: StaleEditDocumentRefusal["rejected"] = [];
	for (const [index, operation] of operations.entries()) {
		const targetIds = targetIdsFromOperation(operation);
		if (targetIds.length === 0) {
			continue;
		}
		const current = captureBlockViewHashes(editor, targetIds, viewMode);
		if (!viewHashesChanged(targetIds, recordedViewHashes, current)) {
			continue;
		}
		rejected.push({
			index,
			operation: String(operation.operation ?? "(missing)"),
			reason: "stale-target: view-changed",
		});
	}
	if (rejected.length === 0) {
		return null;
	}
	return {
		ok: false,
		appliedOperations: [],
		rejected,
		outline: buildLiveOutline(editor),
		hint: "A targeted block's view changed since it was read. Nothing was applied. Retry using the ids in `outline`.",
	};
}
