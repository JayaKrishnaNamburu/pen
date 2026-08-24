import type { BlockHandle, DiagnosticEvent, Editor } from "@input/pen-types";

const MISSING_BLOCK_CODE = "block-logical-text-missing";

/**
 * Stored text of a block. Empty string is empty; missing blocks emit a
 * diagnostic and return "".
 */
export function blockLogicalText(editor: Editor, blockId: string): string {
	const handle = editor.getBlock(blockId);
	if (!handle) {
		emitMissingBlock(editor, blockId);
		return "";
	}
	return storedTextFromHandle(handle);
}

function storedTextFromHandle(handle: BlockHandle): string {
	return handle
		.textDeltas()
		.map((delta) => (typeof delta.insert === "string" ? delta.insert : ""))
		.join("");
}

function emitMissingBlock(editor: Editor, blockId: string): void {
	const emit = editor.internals?.emit;
	if (typeof emit !== "function") {
		return;
	}
	const event: DiagnosticEvent = {
		code: MISSING_BLOCK_CODE,
		level: "warn",
		source: "core",
		message: `blockLogicalText: block "${blockId}" does not exist`,
		remediation: "Pass a block id that is in the current document.",
		blockId,
	};
	emit("diagnostic", event);
}
