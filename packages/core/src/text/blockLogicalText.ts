import type { BlockHandle, DiagnosticEvent, Editor } from "@input/pen-types";
import { logicalTextFromStored } from "@input/pen-types";

export { logicalTextFromStored };

const MISSING_BLOCK_CODE = "block-logical-text-missing";

/**
 * Logical text of a block (I11). Empty string and sentinel-only storage
 * are identical. Missing blocks emit a diagnostic and return `""`.
 */
export function blockLogicalText(editor: Editor, blockId: string): string {
	const handle = editor.getBlock(blockId);
	if (!handle) {
		emitMissingBlock(editor, blockId);
		return "";
	}
	return logicalTextFromStored(storedTextFromHandle(handle));
}

function storedTextFromHandle(handle: BlockHandle): string {
	return handle.textDeltas()
		.map((delta) => delta.insert)
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
