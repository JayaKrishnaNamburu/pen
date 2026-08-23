// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createEditor, getCommandRegistry } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { FieldEditorInputController } from "../controller";
import { ExpandedContentEditableBackend } from "../expandedContentEditableBackend";

type Activation = {
	blockId: string;
	anchorOffset: number;
	focusOffset: number;
};

function createFieldEditor(blockId: string) {
	const activations: Activation[] = [];
	let deactivated = 0;
	const controller = {
		focusBlockId: blockId,
		inputMode: "richtext" as const,
		activeCellCoord: null,
		activateCell: () => {},
		activateTextSelection: (
			targetBlockId: string,
			anchorOffset: number,
			focusOffset: number,
		) => {
			activations.push({
				blockId: targetBlockId,
				anchorOffset,
				focusOffset,
			});
		},
		deactivate: () => {
			deactivated += 1;
		},
		resetBackendSelectionAuthority: () => {},
		withBackendSelectionWrite: <T>(write: () => T) => write(),
		requestDomFocus: () => false,
		shouldHandleDomSelectionChange: () => false,
		getBackendSelectionApplicationDepth: () => 0,
		applyDomTextSelection: () => {},
		selectAll: () => false,
		resolveInsertMarks: () => undefined,
	};
	return { controller, activations, deactivated: () => deactivated };
}

function dispatchBeforeInput(host: HTMLElement, inputType: string): void {
	host.dispatchEvent(
		new InputEvent("beforeinput", {
			bubbles: true,
			cancelable: true,
			inputType,
		}),
	);
}

describe("ExpandedContentEditableBackend handleBeforeInput enter", () => {
	it("activates the collapsed caret in-turn after a multi-block insertParagraph", () => {
		const editor = createEditor({ schema: defaultSchema });
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();
		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-text",
				blockId: secondBlockId,
				offset: 0,
				text: "World",
			},
		]);
		editor.selectTextRange(
			{ blockId: firstBlockId, offset: 1 },
			{ blockId: secondBlockId, offset: 2 },
		);
		expect(editor.selection).toMatchObject({
			type: "text",
			isMultiBlock: true,
		});

		const fieldEditor = createFieldEditor(firstBlockId);
		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("expected command registry");
		}
		const dispatched: string[] = [];
		const originalDispatch = registry.dispatch.bind(registry);
		registry.dispatch = ((command, param, context) => {
			dispatched.push(command.name);
			return originalDispatch(command, param, context);
		}) as typeof registry.dispatch;

		const backend = new ExpandedContentEditableBackend(
			editor,
			fieldEditor.controller as unknown as FieldEditorInputController,
		);
		const host = document.createElement("div");
		backend.activate(host);

		const rafCallbacks: FrameRequestCallback[] = [];
		const originalRaf = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			rafCallbacks.push(cb);
			return 1;
		}) as typeof requestAnimationFrame;

		try {
			dispatchBeforeInput(host, "insertParagraph");

			expect(dispatched).toEqual([]);
			expect(fieldEditor.deactivated()).toBe(1);
			expect(editor.getBlock(secondBlockId)).toBeNull();
			expect(editor.getBlock(firstBlockId)?.textContent()).toBe("H\nrld");
			expect(editor.selection).toMatchObject({
				type: "text",
				isMultiBlock: false,
				anchor: { blockId: firstBlockId, offset: 2 },
				focus: { blockId: firstBlockId, offset: 2 },
			});
			expect(fieldEditor.activations).toEqual([
				{
					blockId: firstBlockId,
					anchorOffset: 2,
					focusOffset: 2,
				},
			]);
			expect(rafCallbacks).toHaveLength(0);
		} finally {
			globalThis.requestAnimationFrame = originalRaf;
			backend.deactivate();
			editor.destroy();
		}
	});

	it("activates the split caret in-turn when applyEnterBehavior is the fallback", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 2, 2);

		const registry = getCommandRegistry(editor);
		if (!registry) {
			throw new Error("expected command registry");
		}
		const dispatched: string[] = [];
		registry.dispatch = ((command) => {
			dispatched.push(command.name);
			return false;
		}) as typeof registry.dispatch;

		const fieldEditor = createFieldEditor(blockId);
		const backend = new ExpandedContentEditableBackend(
			editor,
			fieldEditor.controller as unknown as FieldEditorInputController,
		);
		const host = document.createElement("div");
		backend.activate(host);

		const rafCallbacks: FrameRequestCallback[] = [];
		const originalRaf = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
			rafCallbacks.push(cb);
			return 1;
		}) as typeof requestAnimationFrame;

		try {
			dispatchBeforeInput(host, "insertParagraph");

			expect(dispatched).toEqual(["pen.splitBlock"]);
			expect(fieldEditor.deactivated()).toBe(1);
			const blockIds = editor.documentState.blockOrder;
			expect(blockIds).toHaveLength(2);
			expect(editor.getBlock(blockId)?.textContent()).toBe("He");
			const newBlockId = blockIds[1];
			expect(newBlockId).toEqual(expect.any(String));
			expect(editor.getBlock(newBlockId!)?.textContent()).toBe("llo");
			expect(fieldEditor.activations).toEqual([
				{
					blockId: newBlockId,
					anchorOffset: 0,
					focusOffset: 0,
				},
			]);
			expect(rafCallbacks).toHaveLength(0);
		} finally {
			globalThis.requestAnimationFrame = originalRaf;
			backend.deactivate();
			editor.destroy();
		}
	});

	it("activates the split caret in-turn after a dispatched splitBlock", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 2, 2);

		const fieldEditor = createFieldEditor(blockId);
		const backend = new ExpandedContentEditableBackend(
			editor,
			fieldEditor.controller as unknown as FieldEditorInputController,
		);
		const host = document.createElement("div");
		backend.activate(host);

		try {
			dispatchBeforeInput(host, "insertParagraph");

			const blockIds = editor.documentState.blockOrder;
			expect(blockIds).toHaveLength(2);
			const newBlockId = blockIds[1];
			expect(fieldEditor.activations).toEqual([
				{
					blockId: newBlockId,
					anchorOffset: 0,
					focusOffset: 0,
				},
			]);
		} finally {
			backend.deactivate();
			editor.destroy();
		}
	});
});
