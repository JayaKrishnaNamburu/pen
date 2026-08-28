// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { FieldEditorImpl } from "../fieldEditorImpl";
import type { EditContext } from "../editContextTypes";

class FakeEditContext implements EditContext {
	text: string;
	selectionStart: number;
	selectionEnd: number;
	private readonly listeners = new Map<string, Set<(event: Event) => void>>();

	constructor(options?: {
		text?: string;
		selectionStart?: number;
		selectionEnd?: number;
	}) {
		this.text = options?.text ?? "";
		this.selectionStart = options?.selectionStart ?? 0;
		this.selectionEnd = options?.selectionEnd ?? 0;
	}

	updateText(start: number, end: number, text: string): void {
		this.text = `${this.text.slice(0, start)}${text}${this.text.slice(end)}`;
	}

	updateSelection(start: number, end: number): void {
		this.selectionStart = start;
		this.selectionEnd = end;
	}

	updateCharacterBounds(): void {}

	addEventListener(type: string, handler: (event: Event) => void): void {
		const handlers = this.listeners.get(type) ?? new Set();
		handlers.add(handler);
		this.listeners.set(type, handlers);
	}

	removeEventListener(type: string, handler: (event: Event) => void): void {
		this.listeners.get(type)?.delete(handler);
	}
}

const fixtures: Array<{
	editor: ReturnType<typeof createEditor>;
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
	delete (globalThis as { EditContext?: unknown }).EditContext;
});

function mountEditContextEditor(text: string) {
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
	fixtures.push({ editor, fieldEditor, root });
	return { editor, fieldEditor, root, blockId, inline };
}

describe("FE9 EditContext mapped caret after apply", () => {
	it("FE9: programmatic splice drops textupdate authority and updates EditContext", () => {
		const { editor, fieldEditor, blockId, inline } =
			mountEditContextEditor("aa :sm bb");
		const editContext = (
			inline as HTMLElement & { editContext?: FakeEditContext }
		).editContext;
		expect(editContext).toBeDefined();

		fieldEditor.activateTextSelection(blockId, 6, 6);
		fieldEditor.setBackendSelectionAuthority("edit-context-textupdate", {
			blockId,
			anchorOffset: 6,
			focusOffset: 6,
		});
		editContext!.updateSelection(6, 6);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 3,
					to: 6,
					insert: "",
				},
			],
			{ origin: "user" },
		);

		expect(editor.getBlock(blockId)?.textContent()).toBe("aa  bb");
		expect(editor.selection).toMatchObject({
			type: "text",
			focus: { blockId, offset: 3 },
		});
		expect(
			fieldEditor.getBackendSelectionAuthority(
				"edit-context-textupdate",
				blockId,
			),
		).toBeNull();
		expect(editContext!.selectionStart).toBe(3);
		expect(editContext!.selectionEnd).toBe(3);
	});
});
