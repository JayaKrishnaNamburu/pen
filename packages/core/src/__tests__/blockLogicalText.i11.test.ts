import type { BlockHandle, DiagnosticEvent, Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import { createHeadlessEditor } from "../editor/editor";
import { blockLogicalText } from "../text/blockLogicalText";

describe("blockLogicalText I14", () => {
	it("EM1 I14: empty text is empty; a user-typed zero-width space is kept", () => {
		const editor = createFakeEditor({
			empty: "",
			typed: "keep\u200Bme",
			lead: "\u200Blead",
			trail: "trail\u200B",
		});

		expect(blockLogicalText(editor, "empty")).toBe("");
		expect(blockLogicalText(editor, "typed")).toBe("keep\u200Bme");
		expect(blockLogicalText(editor, "lead")).toBe("\u200Blead");
		expect(blockLogicalText(editor, "trail")).toBe("trail\u200B");
	});

	it("missing block emits a diagnostic and returns empty text", () => {
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

	it("EM1 I14: headless empty block and typed ZWSP round-trip through the API", () => {
		const editor = createHeadlessEditor({ schema: createDefaultSchema() });
		const block = editor.firstBlock();
		expect(block).not.toBeNull();
		if (!block) {
			return;
		}

		expect(blockLogicalText(editor, block.id)).toBe("");

		editor.apply([
			{
				type: "splice-text",
				blockId: block.id,
				from: 0,
				to: 0,
				insert: "keep\u200Bme",
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
				textContent: () => stored,
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
