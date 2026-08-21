import { describe, expect, it } from "vitest";
import { createEditor, getCommandRegistry } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { applyDeleteBehavior } from "../commandsDelete";
import { DIRECT_HANDLERS } from "../contenteditableDirectHandlers";
import { handleFieldEditorKeyDown } from "../keyHandling";
import type { FieldEditorInputController } from "../controller";
import type { FieldEditorTextLike } from "../crdt";

/**
 * Unresolved product fork. `applyDeleteBehavior` SELECTs an adjacent inline
 * atom. Live keydown / beforeinput DELETES it via `registry.dispatch`.
 * These are not the same product. Do not retarget the select tests onto
 * `registry.dispatch` — that would stay green while changing the editor.
 */

function mentionDeltas() {
	return [
		{ insert: "hi" },
		{
			insert: {
				type: "mention",
				props: { id: "1", label: "Ada" },
			},
		},
		{ insert: "z" },
	];
}

function createMentionEditor() {
	const editor = createEditor({ schema: defaultSchema });
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "insert-text", blockId, offset: 0, text: "hiz" },
		{
			type: "insert-inline-node",
			blockId,
			offset: 2,
			nodeType: "mention",
			props: { id: "1", label: "Ada" },
		},
	]);
	return { editor, blockId };
}

function hasMention(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): boolean {
	return (editor.getBlock(blockId)?.inlineDeltas() ?? []).some((delta) => {
		const insert = delta.insert;
		return (
			typeof insert === "object" &&
			insert !== null &&
			"type" in insert &&
			insert.type === "mention"
		);
	});
}

function getYText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): FieldEditorTextLike {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw<{
		getMap(name: string): {
			get(key: string): { get(field: string): unknown } | undefined;
		};
	}>(doc);
	const ytext = ydoc
		.getMap("blocks")
		.get(blockId)
		?.get("content") as FieldEditorTextLike | null;
	if (!ytext) {
		throw new Error(`Missing test Y.Text for block ${blockId}`);
	}
	return ytext;
}

function createKeyEvent(key: string): KeyboardEvent {
	let defaultPrevented = false;
	return {
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		altKey: false,
		isComposing: false,
		defaultPrevented,
		preventDefault() {
			defaultPrevented = true;
			Object.defineProperty(this, "defaultPrevented", {
				configurable: true,
				value: true,
			});
		},
	} as KeyboardEvent;
}

function createFieldEditor(blockId: string) {
	return {
		focusBlockId: blockId,
		inputMode: "richtext" as const,
		activeCellCoord: null,
		activateCell: () => {},
		activateTextSelection: () => {},
		deactivate: () => {},
		selectAll: () => false,
		resolveInsertMarks: () => undefined,
	};
}

describe("inline atom delete divergence", () => {
	describe("fallback applyDeleteBehavior (select)", () => {
		it("applyDeleteBehavior backward selects the adjacent atom and does not mutate", () => {
			const { editor, blockId } = createMentionEditor();

			const target = applyDeleteBehavior(editor, {
				blockId,
				ytext: getYText(editor, blockId),
				range: { start: 3, end: 3 },
				direction: "backward",
			});

			expect(target).toEqual({
				blockId,
				anchorOffset: 2,
				focusOffset: 3,
			});
			expect(editor.getBlock(blockId)?.inlineDeltas()).toEqual(
				mentionDeltas(),
			);
			editor.destroy();
		});

		it("applyDeleteBehavior forward selects the adjacent atom and does not mutate", () => {
			const { editor, blockId } = createMentionEditor();

			const target = applyDeleteBehavior(editor, {
				blockId,
				ytext: getYText(editor, blockId),
				range: { start: 2, end: 2 },
				direction: "forward",
			});

			expect(target).toEqual({
				blockId,
				anchorOffset: 2,
				focusOffset: 3,
			});
			expect(hasMention(editor, blockId)).toBe(true);
			editor.destroy();
		});
	});

	describe("live keydown / beforeinput (delete)", () => {
		it("handleFieldEditorKeyDown Backspace deletes the adjacent atom in one step", () => {
			const { editor, blockId } = createMentionEditor();
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

			const handled = handleFieldEditorKeyDown({
				event: createKeyEvent("Backspace"),
				editor,
				fieldEditor: createFieldEditor(blockId),
				ytext: getYText(editor, blockId),
				range: { start: 3, end: 3 },
			});

			expect(handled).toBe(true);
			expect(dispatched).toContain("pen.deleteBackward");
			expect(hasMention(editor, blockId)).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hiz");
			editor.destroy();
		});

		it("DIRECT_HANDLERS.deleteContentBackward deletes the adjacent atom in one step", () => {
			const { editor, blockId } = createMentionEditor();
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

			DIRECT_HANDLERS.deleteContentBackward(
				{ inputType: "deleteContentBackward" } as InputEvent,
				editor,
				getYText(editor, blockId),
				createFieldEditor(blockId) as unknown as FieldEditorInputController,
				{} as HTMLElement,
				{
					resolveCurrentInputRange: () => ({ start: 3, end: 3 }),
					applyListInputRule: () => false,
					applyInlineTextEdit: () => {
						throw new Error(
							"fallback applyInlineTextEdit must not run when registry dispatch succeeds",
						);
					},
				},
			);

			expect(dispatched).toContain("pen.deleteBackward");
			expect(hasMention(editor, blockId)).toBe(false);
			expect(editor.getBlock(blockId)?.textContent()).toBe("hiz");
			editor.destroy();
		});
	});

	it("select vs delete are different products on the same fixture", () => {
		const selectSide = createMentionEditor();
		const deleteSide = createMentionEditor();

		const selected = applyDeleteBehavior(selectSide.editor, {
			blockId: selectSide.blockId,
			ytext: getYText(selectSide.editor, selectSide.blockId),
			range: { start: 3, end: 3 },
			direction: "backward",
		});
		const handled = handleFieldEditorKeyDown({
			event: createKeyEvent("Backspace"),
			editor: deleteSide.editor,
			fieldEditor: createFieldEditor(deleteSide.blockId),
			ytext: getYText(deleteSide.editor, deleteSide.blockId),
			range: { start: 3, end: 3 },
		});

		expect(selected).toEqual({
			blockId: selectSide.blockId,
			anchorOffset: 2,
			focusOffset: 3,
		});
		expect(hasMention(selectSide.editor, selectSide.blockId)).toBe(true);
		expect(handled).toBe(true);
		expect(hasMention(deleteSide.editor, deleteSide.blockId)).toBe(false);
		selectSide.editor.destroy();
		deleteSide.editor.destroy();
	});
});
