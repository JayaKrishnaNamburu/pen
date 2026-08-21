import type { BlockHandle, DiagnosticEvent, Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createHeadlessEditor } from "../editor/editor";
import {
	blockLogicalText,
	logicalTextFromStored,
} from "../text/blockLogicalText";

const EMPTY_BLOCK_SENTINEL = "\u200B";

describe("blockLogicalText I11", () => {
	it("I11: empty string and sentinel-only storage are identical", () => {
		expect(logicalTextFromStored("")).toBe("");
		expect(logicalTextFromStored(EMPTY_BLOCK_SENTINEL)).toBe("");
		expect(logicalTextFromStored("")).toBe(
			logicalTextFromStored(EMPTY_BLOCK_SENTINEL),
		);
	});

	it("I11: a user-typed zero-width space in non-empty text is kept", () => {
		expect(logicalTextFromStored("keep\u200Bme")).toBe("keep\u200Bme");
		expect(logicalTextFromStored("\u200Blead")).toBe("\u200Blead");
		expect(logicalTextFromStored("trail\u200B")).toBe("trail\u200B");
	});

	it("I11: blockLogicalText resolves an empty block to empty text", () => {
		const editor = createFakeEditor({
			empty: "",
			sentinel: EMPTY_BLOCK_SENTINEL,
			typed: "keep\u200Bme",
		});

		expect(blockLogicalText(editor, "empty")).toBe("");
		expect(blockLogicalText(editor, "sentinel")).toBe("");
		expect(blockLogicalText(editor, "empty")).toBe(
			blockLogicalText(editor, "sentinel"),
		);
		expect(blockLogicalText(editor, "typed")).toBe("keep\u200Bme");
	});

	it("I11: missing block emits a diagnostic and returns empty text", () => {
		const diagnostics: DiagnosticEvent[] = [];
		const editor = createFakeEditor({}, (event) => {
			diagnostics.push(event);
		});

		expect(blockLogicalText(editor, "missing")).toBe("");
		expect(diagnostics).toEqual([
			expect.objectContaining({
				code: "block-logical-text-missing",
				level: "warn",
				source: "core",
				blockId: "missing",
			}),
		]);
	});

	it("I11: headless empty block and typed ZWSP round-trip through the API", () => {
		const editor = createHeadlessEditor({ schema: createDefaultSchema() });
		const block = editor.firstBlock();
		expect(block).not.toBeNull();
		if (!block) {
			return;
		}

		expect(blockLogicalText(editor, block.id)).toBe("");

		editor.apply([
			{
				type: "insert-text",
				blockId: block.id,
				offset: 0,
				text: "keep\u200Bme",
			},
		]);
		expect(blockLogicalText(editor, block.id)).toBe("keep\u200Bme");

		void editor.destroy();
	});
});

function createFakeEditor(
	texts: Record<string, string>,
	onDiagnostic?: (event: DiagnosticEvent) => void,
): Editor {
	return {
		getBlock(blockId: string) {
			if (!Object.hasOwn(texts, blockId)) {
				return null;
			}
			const stored = texts[blockId] ?? "";
			return {
				id: blockId,
				textDeltas: () => [{ insert: stored }],
				textContent: () =>
					stored === EMPTY_BLOCK_SENTINEL ? "" : stored,
			} as unknown as BlockHandle;
		},
		internals: {
			emit(event: string, payload: unknown) {
				if (event === "diagnostic" && onDiagnostic) {
					onDiagnostic(payload as DiagnosticEvent);
				}
			},
		},
	} as unknown as Editor;
}
