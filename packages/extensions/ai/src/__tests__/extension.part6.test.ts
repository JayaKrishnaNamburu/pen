import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	aiExtension,
	getAIInlineHistoryController,
	getAIController,
	rejectSuggestion,
} from "../index";
import {
	readAllSuggestions,
	readBlockSuggestionMeta,
	readSuggestionsFromBlock,
} from "../suggestions/persistent";
import {
	createDeferred,
	testStreamingToolExtension,
	waitForPreview,
} from "./extension.testUtils";

describe("aiExtension", () => {
	it("only restores a suspended inline session through history", () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});

			expect(session).not.toBeNull();
			controller.suspendInlineSession(session!.id);
			expect(controller.getState().activeSessionId).toBeNull();
			expect(
				controller.getState().sessions[0]?.contextualPrompt?.composer.isOpen,
			).toBe(false);

			editor.selectTextRange(
				{ blockId, offset: 0 },
				{ blockId, offset: 5 },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			expect(controller.getState().activeSessionId).toBeNull();
			expect(
				controller.getState().sessions[0]?.contextualPrompt?.composer.isOpen,
			).toBe(false);

			editor.internals.emit("historyApplied", {
				kind: "undo",
				selection: editor.selection,
				focusBlockId: blockId,
				requestId: 1,
			});

			expect(controller.getState().activeSessionId).toBe(session!.id);
			expect(
				controller.getState().sessions[0]?.contextualPrompt?.composer.isOpen,
			).toBe(true);

			controller.suspendInlineSession(session!.id);
			editor.internals.emit("historyApplied", {
				kind: "redo",
				selection: editor.selection,
				focusBlockId: blockId,
				requestId: 2,
			});

			expect(controller.getState().activeSessionId).toBe(session!.id);
			expect(
				controller.getState().sessions[0]?.contextualPrompt?.composer.isOpen,
			).toBe(true);
		});

	it("records inline history at settled turn checkpoints instead of stream chunks", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "pla" };
								yield { type: "text-delta" as const, delta: "net" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(session).not.toBeNull();
			const inlineHistory = getAIInlineHistoryController(editor)!;

			await controller.runSessionPrompt(session!.id, "Rewrite this");
			controller.suspendInlineSession(session!.id);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);
			expect(controller.getState().sessions[0]?.turns[0]?.status).toBe("review");

			expect(inlineHistory.undoInlineHistory()).toBe(true);
			expect(controller.getState().activeSessionId).toBe(session!.id);
			expect(
				controller.getState().sessions[0]?.contextualPrompt?.composer.isOpen,
			).toBe(true);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);

			expect(inlineHistory.undoInlineHistory()).toBe(true);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(0);
			expect(
				controller.getState().sessions[0]?.contextualPrompt?.composer.draftPrompt,
			).toBe("Rewrite this");
		});

	it("cycles selection inline turn history one turn at a time through shortcuts", async () => {
			let turnIndex = 0;
			const turnOutputs = ["planet", "galaxy"];
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: turnOutputs[turnIndex] ?? "done" };
								yield { type: "done" as const };
								turnIndex += 1;
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const inlineHistory = getAIInlineHistoryController(editor)!;
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(session).not.toBeNull();

			await controller.runSessionPrompt(session!.id, "First rewrite");
			controller.suspendInlineSession(session!.id);
			await controller.runSessionPrompt(session!.id, "Second rewrite");
			controller.suspendInlineSession(session!.id);

			expect(controller.getState().sessions[0]?.turns).toHaveLength(2);
			expect(inlineHistory.canHandleShortcut("undo")).toBe(true);

			expect(inlineHistory.handleShortcut("undo")).toBe(true);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);

			expect(inlineHistory.handleShortcut("undo")).toBe(true);
			expect(controller.getState().sessions).toHaveLength(0);
			expect(controller.getState().activeSessionId).toBeNull();

			expect(inlineHistory.canHandleShortcut("redo")).toBe(true);
			expect(inlineHistory.handleShortcut("redo")).toBe(true);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);

			expect(inlineHistory.handleShortcut("redo")).toBe(true);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(2);
		});

	it("keeps the public AI controller inline history methods available", async () => {
			let turnIndex = 0;
			const turnOutputs = ["planet", "galaxy"];
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: turnOutputs[turnIndex] ?? "done" };
								yield { type: "done" as const };
								turnIndex += 1;
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const inlineHistory = getAIInlineHistoryController(editor)!;
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(session).not.toBeNull();

			await controller.runSessionPrompt(session!.id, "First rewrite");
			controller.suspendInlineSession(session!.id);
			await controller.runSessionPrompt(session!.id, "Second rewrite");
			controller.suspendInlineSession(session!.id);

			expect(controller.canUndoInlineHistory()).toBe(true);
			expect(controller.canRedoInlineHistory()).toBe(false);
			expect(inlineHistory.canHandleShortcut("undo")).toBe(true);
			expect(inlineHistory.canUndoInlineHistory()).toBe(true);
			expect(controller.undoInlineHistory()).toBe(true);
			expect(controller.canRedoInlineHistory()).toBe(true);
			expect(controller.redoInlineHistory()).toBe(true);
		});

	it("cycles selection inline turn history even when suggest mode is enabled", async () => {
			let turnIndex = 0;
			const turnOutputs = ["planet", "galaxy"];
			const editor = createEditor({
				extensions: [
					aiExtension({
						suggestMode: true,
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: turnOutputs[turnIndex] ?? "done" };
								yield { type: "done" as const };
								turnIndex += 1;
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const inlineHistory = getAIInlineHistoryController(editor)!;
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(session).not.toBeNull();

			await controller.runSessionPrompt(session!.id, "First rewrite");
			controller.suspendInlineSession(session!.id);
			await controller.runSessionPrompt(session!.id, "Second rewrite");
			controller.suspendInlineSession(session!.id);

			expect(inlineHistory.canHandleShortcut("undo")).toBe(true);
			expect(inlineHistory.handleShortcut("undo")).toBe(true);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);

			expect(inlineHistory.handleShortcut("undo")).toBe(true);
			expect(controller.getState().sessions).toHaveLength(0);
		});

	it("prefers document undo over local inline history shortcuts when both exist", () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const inlineHistory = getAIInlineHistoryController(editor)!;
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(session).not.toBeNull();
			controller.suspendInlineSession(session!.id);

			editor.apply(
				[{ type: "insert-text", blockId, offset: 11, text: "!" }],
				{ origin: "user" },
			);

			expect(editor.getBlock(blockId)!.textContent()).toBe("Hello world!");
			expect(inlineHistory.canUndoInlineHistory()).toBe(true);
			expect(inlineHistory.canHandleShortcut("undo")).toBe(false);

			expect(editor.undoManager.undo()).toBe(true);
			expect(editor.getBlock(blockId)!.textContent()).toBe("Hello world");
			expect(inlineHistory.canHandleShortcut("undo")).toBe(false);
		});
});
