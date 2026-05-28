import { describe, expect, it } from "vitest";
import { createEditor } from "@pen/core";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	applySuggestedAIOperations,
	aiExtension,
	getAIInlineHistoryController,
	getAIController,
	rejectSuggestion,
} from "../index";
import {
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

	it("undoes and redoes a server-authored inline turn result without a local undo stack item", async () => {
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

			await controller.runSessionPrompt(session!.id, "Rewrite this");
			const turn = controller.getState().sessions[0]?.turns[0];
			expect(turn).toBeTruthy();

			const operations = [
				{
					type: "replace-text" as const,
					blockId,
					offset: 6,
					length: 5,
					text: "planet",
				},
			];
			const applyResult = applySuggestedAIOperations(editor, {
				operations,
				sessionId: session!.id,
				turnId: turn!.id,
				generationId: "server-generation-1",
				origin: "system",
			});
			(controller as any)._syncSuggestionsFromDocument();
			(controller as any)._updateSessionTurn(session!.id, turn!.id, {
				status: "review",
				generationId: "server-generation-1",
				suggestionIds: applyResult.suggestionIds,
			});
			expect(
				controller.registerExternalInlineTurnResult({
					sessionId: session!.id,
					turnId: turn!.id,
					historyId: "server-generation-1",
					operations,
					suggestionIds: applyResult.suggestionIds,
				}),
			).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello planet",
			);
			expect(editor.undoManager.canUndo()).toBe(false);

			expect(controller.undoInlineHistory()).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello world",
			);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(0);

			expect(controller.redoInlineHistory()).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello planet",
			);
			expect(controller.getState().sessions[0]?.turns[0]?.status).toBe(
				"review",
			);
		});

	it("undoes a server-authored result when the prompt has a newer UI-only snapshot", async () => {
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
			await controller.runSessionPrompt(session!.id, "Rewrite this");
			const turn = controller.getState().sessions[0]?.turns[0];
			const operations = [
				{
					type: "replace-text" as const,
					blockId,
					offset: 6,
					length: 5,
					text: "planet",
				},
			];
			const applyResult = applySuggestedAIOperations(editor, {
				operations,
				sessionId: session!.id,
				turnId: turn!.id,
				generationId: "server-generation-1",
				origin: "system",
			});
			(controller as any)._syncSuggestionsFromDocument();
			(controller as any)._updateSessionTurn(session!.id, turn!.id, {
				status: "review",
				generationId: "server-generation-1",
				suggestionIds: applyResult.suggestionIds,
			});
			controller.registerExternalInlineTurnResult({
				sessionId: session!.id,
				turnId: turn!.id,
				historyId: "server-generation-1",
				operations,
				suggestionIds: applyResult.suggestionIds,
			});
			controller.updateContextualPromptDraft(session!.id, "Make it warmer");

			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello planet",
			);
			expect((controller as any).handleInlineHistoryShortcut("undo")).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello world",
			);
		});

	it("walks server-authored inline turn results one turn at a time", async () => {
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
			editor.apply([{ type: "insert-text", blockId, offset: 0, text: "Hello" }], {
				origin: "system",
			});

			const controller = getAIController(editor)!;
			editor.selectTextRange({ blockId, offset: 0 }, { blockId, offset: 5 });
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(session).not.toBeNull();

			await controller.runSessionPrompt(session!.id, "Add greeting detail");
			const firstTurn = controller.getState().sessions[0]?.turns[0];
			const firstOperations = [
				{ type: "insert-text" as const, blockId, offset: 5, text: " there" },
			];
			const firstApplyResult = applySuggestedAIOperations(editor, {
				operations: firstOperations,
				sessionId: session!.id,
				turnId: firstTurn!.id,
				generationId: "server-generation-1",
				origin: "system",
			});
			(controller as any)._syncSuggestionsFromDocument();
			(controller as any)._updateSessionTurn(session!.id, firstTurn!.id, {
				status: "review",
				generationId: "server-generation-1",
				suggestionIds: firstApplyResult.suggestionIds,
			});
			controller.registerExternalInlineTurnResult({
				sessionId: session!.id,
				turnId: firstTurn!.id,
				historyId: "server-generation-1",
				operations: firstOperations,
				suggestionIds: firstApplyResult.suggestionIds,
			});

			await controller.runSessionPrompt(session!.id, "Add recipient detail");
			const secondTurn = controller.getState().sessions[0]?.turns[1];
			const secondOperations = [
				{ type: "insert-text" as const, blockId, offset: 11, text: " friend" },
			];
			const secondApplyResult = applySuggestedAIOperations(editor, {
				operations: secondOperations,
				sessionId: session!.id,
				turnId: secondTurn!.id,
				generationId: "server-generation-2",
				origin: "system",
			});
			(controller as any)._syncSuggestionsFromDocument();
			(controller as any)._updateSessionTurn(session!.id, secondTurn!.id, {
				status: "review",
				generationId: "server-generation-2",
				suggestionIds: secondApplyResult.suggestionIds,
			});
			controller.registerExternalInlineTurnResult({
				sessionId: session!.id,
				turnId: secondTurn!.id,
				historyId: "server-generation-2",
				operations: secondOperations,
				suggestionIds: secondApplyResult.suggestionIds,
			});

			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello there friend",
			);
			const firstUndoTargetIndex = (controller as any)._resolveInlineHistoryTargetIndex(
				"undo",
				{ shortcutOnly: true },
			);
			expect(
				(controller as any)._inlineHistory[firstUndoTargetIndex]?.sessions[0]
					?.turns,
			).toHaveLength(1);
			expect(
				(controller as any)._inlineHistory[firstUndoTargetIndex]?.sessions[0]
					?.turns[0]?.status,
			).toBe("review");
			expect((controller as any).handleInlineHistoryShortcut("undo")).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello there",
			);

			expect((controller as any).handleInlineHistoryShortcut("redo")).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello there friend",
			);
		});

	it("builds per-turn external history when multiple server turns hydrate together", async () => {
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
			editor.apply([{ type: "insert-text", blockId, offset: 0, text: "Hello" }], {
				origin: "system",
			});

			const controller = getAIController(editor)!;
			editor.selectTextRange({ blockId, offset: 0 }, { blockId, offset: 5 });
			const session = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			await controller.runSessionPrompt(session!.id, "Add greeting detail");
			const firstTurn = controller.getState().sessions[0]?.turns[0];
			const firstOperations = [
				{ type: "insert-text" as const, blockId, offset: 5, text: " there" },
			];
			const firstApplyResult = applySuggestedAIOperations(editor, {
				operations: firstOperations,
				sessionId: session!.id,
				turnId: firstTurn!.id,
				generationId: "server-generation-1",
				origin: "system",
			});
			(controller as any)._syncSuggestionsFromDocument();
			(controller as any)._updateSessionTurn(session!.id, firstTurn!.id, {
				status: "review",
				generationId: "server-generation-1",
				suggestionIds: firstApplyResult.suggestionIds,
			});

			await controller.runSessionPrompt(session!.id, "Add recipient detail");
			const secondTurn = controller.getState().sessions[0]?.turns[1];
			const secondOperations = [
				{ type: "insert-text" as const, blockId, offset: 11, text: " friend" },
			];
			const secondApplyResult = applySuggestedAIOperations(editor, {
				operations: secondOperations,
				sessionId: session!.id,
				turnId: secondTurn!.id,
				generationId: "server-generation-2",
				origin: "system",
			});
			(controller as any)._syncSuggestionsFromDocument();
			(controller as any)._updateSessionTurn(session!.id, secondTurn!.id, {
				status: "review",
				generationId: "server-generation-2",
				suggestionIds: secondApplyResult.suggestionIds,
			});

			controller.registerExternalInlineTurnResult({
				sessionId: session!.id,
				turnId: firstTurn!.id,
				historyId: "server-generation-1",
				operations: firstOperations,
				suggestionIds: firstApplyResult.suggestionIds,
			});
			controller.registerExternalInlineTurnResult({
				sessionId: session!.id,
				turnId: secondTurn!.id,
				historyId: "server-generation-2",
				operations: secondOperations,
				suggestionIds: secondApplyResult.suggestionIds,
			});

			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello there friend",
			);
			expect((controller as any).handleInlineHistoryShortcut("undo")).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello there",
			);
			expect((controller as any).handleInlineHistoryShortcut("undo")).toBe(true);
			expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
				"Hello",
			);
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
