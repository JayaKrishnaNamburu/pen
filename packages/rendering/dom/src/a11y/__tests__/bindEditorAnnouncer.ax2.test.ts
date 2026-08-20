// @vitest-environment jsdom

import { createEditor, createHeadlessEditor } from "@input/pen-core";
import { afterEach, describe, expect, it } from "vitest";

import { bindEditorAnnouncer } from "../bindEditorAnnouncer";
import { FieldEditorImpl } from "../../field-editor/fieldEditorImpl";
import { defaultSchema } from "@input/pen-schema-default";

const fixtures: Array<{
	stop?: () => void;
	fieldEditor?: FieldEditorImpl;
	root: HTMLElement;
	editor: ReturnType<typeof createHeadlessEditor>;
}> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		fixture.stop?.();
		fixture.fieldEditor?.destroy();
		fixture.root.remove();
		void fixture.editor.destroy();
	}
});

function liveRegion(root: ParentNode): HTMLElement | null {
	return root.querySelector('[role="status"]');
}

describe("bindEditorAnnouncer (AX2)", () => {
	it("AX2: convert-block writes live-region text from the catalog", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const root = document.createElement("div");
		document.body.appendChild(root);
		const stop = bindEditorAnnouncer(editor, root);
		fixtures.push({ editor, root, stop });

		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "convert-block",
				blockId,
				newType: "heading",
				newProps: { level: 1 },
			},
		]);

		expect(liveRegion(root)?.textContent).toBe("Converted to Heading");
	});

	it("AX2: block selection enter and change announce counts", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const root = document.createElement("div");
		document.body.appendChild(root);
		const stop = bindEditorAnnouncer(editor, root);
		fixtures.push({ editor, root, stop });

		const firstId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "b2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.selectBlocks([firstId]);
		expect(liveRegion(root)?.textContent).toBe("1 block selected");

		editor.selectBlocks([firstId, "b2"]);
		expect(liveRegion(root)?.textContent).toBe("2 blocks selected");
	});

	it("AX2: undo and redo announce a content hint", () => {
		const editor = createEditor({ schema: defaultSchema });
		const root = document.createElement("div");
		document.body.appendChild(root);
		const stop = bindEditorAnnouncer(editor, root);
		fixtures.push({ editor, root, stop });

		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "hello" },
		]);
		editor.undoManager.undo();
		expect(liveRegion(root)?.textContent).toBe("Undid Paragraph");

		editor.undoManager.redo();
		expect(liveRegion(root)?.textContent).toBe("Redid Paragraph");
	});

	it("AX2: FieldEditorImpl mounts the live region on the editor root", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const fieldEditor = new FieldEditorImpl(editor);
		const root = document.createElement("div");
		document.body.appendChild(root);
		fixtures.push({ editor, root, fieldEditor });

		fieldEditor.setRootElement(root);
		expect(liveRegion(root)).not.toBeNull();

		fieldEditor.destroy();
		expect(liveRegion(root)).toBeNull();
	});
});
