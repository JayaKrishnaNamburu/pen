// @vitest-environment jsdom

import { createHeadlessEditor } from "@input/pen-core";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema";

import { FieldEditorImpl } from "../../field-editor/fieldEditorImpl";
import { handleFieldEditorPointerActivate } from "../../host/pointerActivation";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { FOCUS_SINK_ATTR } from "../focusSink";

const fixtures: Array<{
	editor: ReturnType<typeof createHeadlessEditor>;
	fieldEditor: FieldEditorImpl;
	root: HTMLElement;
}> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		fixture.fieldEditor.destroy();
		fixture.root.remove();
		fixture.editor.destroy();
	}
});

function mouseEvent(
	target: EventTarget,
	init: MouseEventInit = {},
): MouseEvent {
	const event = new MouseEvent("mousedown", {
		bubbles: true,
		button: 0,
		clientX: 0,
		clientY: 0,
		...init,
	});
	Object.defineProperty(event, "target", { value: target });
	return event;
}

function stubRect(
	element: HTMLElement,
	rect: { top: number; bottom: number },
): void {
	element.getBoundingClientRect = () =>
		({
			x: 0,
			y: rect.top,
			top: rect.top,
			bottom: rect.bottom,
			left: 0,
			right: 200,
			width: 200,
			height: rect.bottom - rect.top,
			toJSON() {
				return this;
			},
		}) as DOMRect;
}

function mountEditor(blockCount = 1): {
	editor: ReturnType<typeof createHeadlessEditor>;
	fieldEditor: FieldEditorImpl;
	root: HTMLElement;
	blocksHost: HTMLElement;
	blocks: HTMLElement[];
} {
	const editor = createHeadlessEditor({ schema: defaultSchema });
	const fieldEditor = new FieldEditorImpl(editor);
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	const blocksHost = document.createElement("div");
	const first = editor.firstBlock()!;
	const blocks: HTMLElement[] = [];

	const firstBlock = document.createElement("div");
	firstBlock.setAttribute(DATA_ATTRS.editorBlock, "");
	firstBlock.setAttribute(DATA_ATTRS.blockId, first.id);
	const firstInline = document.createElement("span");
	firstInline.setAttribute(DATA_ATTRS.inlineContent, "");
	firstBlock.append(firstInline);
	blocksHost.append(firstBlock);
	blocks.push(firstBlock);

	for (let index = 1; index < blockCount; index += 1) {
		const blockId = `p${index + 1}`;
		editor.apply([
			{
				type: "insert-block",
				blockId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		const block = document.createElement("div");
		block.setAttribute(DATA_ATTRS.editorBlock, "");
		block.setAttribute(DATA_ATTRS.blockId, blockId);
		const inline = document.createElement("span");
		inline.setAttribute(DATA_ATTRS.inlineContent, "");
		block.append(inline);
		blocksHost.append(block);
		blocks.push(block);
	}

	root.append(blocksHost);
	document.body.append(root);
	fieldEditor.setRootElement(root);
	fixtures.push({ editor, fieldEditor, root });
	return { editor, fieldEditor, root, blocksHost, blocks };
}

function sink(root: HTMLElement): HTMLElement | null {
	return root.querySelector(`[${FOCUS_SINK_ATTR}]`);
}

function liveRegion(root: HTMLElement): HTMLElement | null {
	return root.querySelector('[role="status"]');
}

describe("pointer activation a11y consequences", () => {
	it("clicking a text block keeps the sink hidden and the live region empty", () => {
		const { editor, fieldEditor, root, blocksHost, blocks } = mountEditor();
		const handled = handleFieldEditorPointerActivate({
			event: mouseEvent(blocks[0]!),
			editor,
			fieldEditor,
			root,
			blocksHost,
		});

		expect(handled).toBe(true);
		// Text caret, not block/cell selection. AX1 keeps the sink
		// presentation. AX2 does not announce ordinary caret placement.
		// jsdom cannot speak this; MANUAL.md scenario 2 is the AT check.
		expect(sink(root)?.getAttribute("aria-hidden")).toBe("true");
		expect(sink(root)?.tabIndex).toBe(-1);
		expect(sink(root)?.hasAttribute("role")).toBe(false);
		expect(liveRegion(root)?.textContent ?? "").toBe("");
	});

	it("a host click below the last block activates that field the same way", () => {
		const { editor, fieldEditor, root, blocksHost, blocks } =
			mountEditor(2);
		stubRect(blocks[0]!, { top: 0, bottom: 20 });
		stubRect(blocks[1]!, { top: 20, bottom: 40 });

		const handled = handleFieldEditorPointerActivate({
			event: mouseEvent(blocksHost, { clientY: 80 }),
			editor,
			fieldEditor,
			root,
			blocksHost,
		});

		// The brief's "dead zone stays inactive" does not match this
		// path: below-last-block host chrome activates the last text
		// block (pointerActivation.ts ~167). A11y outcome is still a
		// text caret — sink hidden, no live-region write.
		expect(handled).toBe(true);
		expect(sink(root)?.getAttribute("aria-hidden")).toBe("true");
		expect(sink(root)?.tabIndex).toBe(-1);
		expect(liveRegion(root)?.textContent ?? "").toBe("");
	});

	it("a click in the gap between blocks does not change sink or live region", () => {
		const { editor, fieldEditor, root, blocksHost, blocks } =
			mountEditor(2);
		stubRect(blocks[0]!, { top: 0, bottom: 20 });
		stubRect(blocks[1]!, { top: 40, bottom: 60 });

		const handled = handleFieldEditorPointerActivate({
			event: mouseEvent(blocksHost, { clientY: 30 }),
			editor,
			fieldEditor,
			root,
			blocksHost,
		});

		expect(handled).toBe(false);
		expect(sink(root)?.getAttribute("aria-hidden")).toBe("true");
		expect(liveRegion(root)?.textContent ?? "").toBe("");
	});
});
