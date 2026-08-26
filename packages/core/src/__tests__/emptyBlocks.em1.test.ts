import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../editor/editor";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function storedInserts(
	editor: ReturnType<typeof createHeadlessEditor>,
	blockId: string,
) {
	return (editor.getBlock(blockId)?.textDeltas() ?? [])
		.map((delta) => delta.insert)
		.filter((insert): insert is string => typeof insert === "string");
}

describe("empty blocks EM1", () => {
	it('EM1: empty text-capable storage stays "" through repeated normalize (I10)', () => {
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		const block = editor.firstBlock();
		expect(block).not.toBeNull();
		if (!block) {
			return;
		}

		expect(block.textContent()).toBe("");
		expect(storedInserts(editor, block.id).join("")).toBe("");
		expect(storedInserts(editor, block.id)).not.toContain("\u200B");

		for (let pass = 0; pass < 3; pass++) {
			editor.apply([
				{
					type: "splice-text",
					blockId: block.id,
					from: 0,
					to: 0,
					insert: "",
				},
			]);
			expect(block.textContent()).toBe("");
			expect(storedInserts(editor, block.id).join("")).toBe("");
			expect(storedInserts(editor, block.id)).not.toContain("\u200B");
		}

		editor.destroy();
	});

	it("EM1: textDeltas() on an empty block has no U+200B insert", () => {
		const editor = createHeadlessEditor({
			schema: createDefaultSchema(),
			preset: noDefaultExtensionsPreset,
		});
		const block = editor.firstBlock();
		expect(block).not.toBeNull();
		if (!block) {
			return;
		}

		for (const delta of block.textDeltas()) {
			expect(delta.insert).not.toBe("\u200B");
		}

		editor.destroy();
	});
});
