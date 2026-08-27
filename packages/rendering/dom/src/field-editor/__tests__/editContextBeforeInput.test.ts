// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { FieldEditorImpl } from "../fieldEditorImpl";
import type { EditContext } from "../editContextTypes";

class FakeEditContext implements EditContext {
	text = "";
	selectionStart = 0;
	selectionEnd = 0;

	updateText(start: number, end: number, text: string): void {
		this.text = `${this.text.slice(0, start)}${text}${this.text.slice(end)}`;
	}

	updateSelection(start: number, end: number): void {
		this.selectionStart = start;
		this.selectionEnd = end;
	}

	updateCharacterBounds(): void {}
	addEventListener(): void {}
	removeEventListener(): void {}
}

const fixtures: Array<{
	editor: ReturnType<typeof createEditor>;
	fieldEditor: FieldEditorImpl;
	root: HTMLElement;
}> = [];

afterEach(() => {
	let fixture = fixtures.pop();
	while (fixture) {
		fixture.fieldEditor.destroy();
		fixture.root.remove();
		fixture.editor.destroy();
		fixture = fixtures.pop();
	}
	delete (globalThis as { EditContext?: unknown }).EditContext;
});

function mountEditContextEditor(text: string, caret: number) {
	(
		globalThis as typeof globalThis & {
			EditContext: typeof FakeEditContext;
		}
	).EditContext = FakeEditContext;

	const editor = createEditor({ schema: defaultSchema });
	const fieldEditor = new FieldEditorImpl(editor);
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	document.body.appendChild(root);

	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "splice-text", blockId, from: 0, to: 0, insert: text },
	]);

	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	block.setAttribute(DATA_ATTRS.blockId, blockId);
	const inline = document.createElement("div");
	inline.setAttribute(DATA_ATTRS.inlineContent, "");
	inline.textContent = text;
	block.appendChild(inline);
	root.appendChild(block);

	fieldEditor.setRootElement(root);
	fieldEditor.activate(blockId);
	editor.selectText(blockId, caret, caret);
	fixtures.push({ editor, fieldEditor, root });

	return { editor, blockId, inline };
}

function dispatchBeforeInput(
	inline: HTMLElement,
	inputType: string,
): InputEvent {
	const event = new InputEvent("beforeinput", {
		bubbles: true,
		cancelable: true,
		inputType,
	});
	inline.dispatchEvent(event);
	return event;
}

describe("B1 EditContext beforeinput policy", () => {
	// The reported bug: Chromium runs deleteSoftLineBackward as a plain DOM
	// edit instead of routing it to the attached EditContext, so the field
	// looked cleared while the document still held the text — and the next
	// keystroke repainted it.
	it("B1: Cmd+Backspace deletes to line start in the document, not just the DOM", () => {
		const { editor, blockId, inline } = mountEditContextEditor(
			"Hello world",
			11,
		);

		const event = dispatchBeforeInput(inline, "deleteSoftLineBackward");

		expect(event.defaultPrevented).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("");
	});

	it("B1: Ctrl+K deletes to line end in the document", () => {
		const { editor, blockId, inline } = mountEditContextEditor(
			"alpha beta",
			8,
		);

		const event = dispatchBeforeInput(inline, "deleteHardLineForward");

		expect(event.defaultPrevented).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("alpha be");
	});

	it("B2: text input stays unprevented so the EditContext textupdate survives", () => {
		const { editor, blockId, inline } = mountEditContextEditor("Hello", 5);

		for (const inputType of [
			"insertText",
			"insertReplacementText",
			"insertCompositionText",
		]) {
			const event = dispatchBeforeInput(inline, inputType);
			expect([inputType, event.defaultPrevented]).toEqual([
				inputType,
				false,
			]);
		}

		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
	});

	it("B1: an unlisted inputType is blocked and reported instead of editing the DOM", () => {
		const { editor, blockId, inline } = mountEditContextEditor("Hello", 5);
		const codes: string[] = [];
		editor.on("diagnostic", (event: { code: string }) => {
			codes.push(event.code);
		});

		const event = dispatchBeforeInput(inline, "insertHorizontalRule");

		expect(event.defaultPrevented).toBe(true);
		expect(codes).toEqual(["unhandled-input-type"]);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
	});

	it("B1: a row whose payload lives on the event is prevented, not dispatched blind", () => {
		const { editor, blockId, inline } = mountEditContextEditor("Hello", 5);

		const event = dispatchBeforeInput(inline, "insertFromPaste");

		expect(event.defaultPrevented).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
	});
});
