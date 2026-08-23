import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createEditor as createCoreEditor } from "../index";
import type { SelectionAuthorityImpl } from "../editor/selection";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor() {
	return createCoreEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

type EditorRuntime = {
	_selection: SelectionAuthorityImpl;
	_doc: Parameters<SelectionAuthorityImpl["updateDocument"]>[0];
	_crdtDoc: Parameters<SelectionAuthorityImpl["updateDocument"]>[1];
};

function authorityOf(editor: ReturnType<typeof createEditor>): SelectionAuthorityImpl {
	return (editor as unknown as EditorRuntime)._selection;
}

describe("SelectionAuthority AS1–AS5", () => {
	it("AS1: a non-collapsed text write mints assoc -1 / +1 local anchors", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.apply([{ type: "insert-text", blockId: id, offset: 0, text: "hello" }]);
		editor.selectText(id, 1, 4);
		const auth = authorityOf(editor) as unknown as {
			_fromAnchor: { assoc: number; provenance: string } | null;
			_toAnchor: { assoc: number; provenance: string } | null;
		};
		expect(auth._fromAnchor).toMatchObject({ assoc: -1, provenance: "local" });
		expect(auth._toAnchor).toMatchObject({ assoc: 1, provenance: "local" });
		editor.destroy();
	});

	it("AS2: a split repairs the held tail anchor onto the destination", () => {
		const editor = createEditor();
		const source = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId: source, offset: 0, text: "meadow sage" },
		]);
		editor.selectText(source, 9, 9);
		editor.apply([
			{
				type: "split-block",
				blockId: source,
				offset: 6,
				newBlockId: "dest",
			},
		]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "dest", offset: 3 },
			focus: { blockId: "dest", offset: 3 },
		});
		expect(authorityOf(editor).record.origin).toBe("mapped");
		editor.destroy();
	});

	it("AS2: copy-split of a same-apply insert-block+text retargets the tail onto the destination", () => {
		const editor = createEditor();
		const seed = editor.firstBlock()!.id;
		editor.apply([{ type: "delete-block", blockId: seed }]);
		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "meadow sage" },
		]);
		editor.selectText("b1", 9, 9);
		editor.apply([
			{
				type: "split-block",
				blockId: "b1",
				offset: 6,
				newBlockId: "b2",
			},
		]);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "b2", offset: 3 },
			focus: { blockId: "b2", offset: 3 },
		});
		editor.destroy();
	});

	it("AS3: block selection still drops a removed id from the summary", () => {
		const editor = createEditor();
		const initial = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.selectBlocks([initial, "keep"]);
		editor.apply([{ type: "delete-block", blockId: initial }]);
		expect(editor.selection).toMatchObject({
			type: "block",
			blockIds: ["keep"],
		});
		editor.destroy();
	});

	it("AS4: selection.ts does not import changes/mapping", () => {
		const source = readFileSync(
			resolve(dirname(fileURLToPath(import.meta.url)), "../editor/selection.ts"),
			"utf8",
		);
		expect(source).not.toMatch(/changes\/mapping/);
		expect(source).toMatch(/anchorRepair/);
	});

	it("AS5: updateDocument releases authority anchors and writes null", () => {
		const editor = createEditor();
		const id = editor.firstBlock()!.id;
		editor.selectText(id, 0, 0);
		const auth = authorityOf(editor);
		const runtime = editor as unknown as EditorRuntime;
		auth.updateDocument(runtime._doc, runtime._crdtDoc);
		expect(editor.selection).toBeNull();
		editor.destroy();
	});
});
