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
	it("creates a fresh inline session when the selection target changes", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "planet" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello world again" }],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const controller = getAIController(editor)!;
			const firstSession = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(firstSession).not.toBeNull();

			await controller.runSessionPrompt(firstSession!.id, "Rewrite the selection");
			expect(controller.getState().sessions).toHaveLength(1);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);

			editor.selectTextRange(
				{ blockId, offset: 0 },
				{ blockId, offset: 5 },
			);

			const secondSession = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(secondSession).not.toBeNull();
			expect(secondSession?.id).not.toBe(firstSession?.id);
			expect(controller.getState().sessions).toHaveLength(2);
			expect(controller.getState().activeSessionId).toBe(secondSession?.id);
			expect(controller.getState().sessions[0]?.turns).toHaveLength(1);
			expect(controller.getState().sessions[0]?.contextualPrompt?.composer.isOpen).toBe(
				false,
			);
			expect(controller.getState().sessions[1]?.turns).toHaveLength(0);
			expect(controller.getState().sessions[1]?.contextualPrompt?.composer.isOpen).toBe(
				true,
			);
		});

	it("keeps inline session prompts selection-scoped for follow-up edits", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "planet" };
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
			const session = controller.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Add an intro paragraph before this text",
			);

			expect(generation.target).toBe("selection");
			expect(controller.getState().sessions[0]?.turns[0]?.target).toBe("selection");
			expect(editor.documentState.blockOrder).toHaveLength(1);
		});

	it("closes the inline composer when resolving a session", async () => {
			const createInlineSessionEditor = () =>
				createEditor({
					extensions: [
						aiExtension({
							model: {
								async *stream() {
									yield { type: "text-delta" as const, delta: "planet" };
									yield { type: "done" as const };
								},
							},
						}),
					],
				});

			const acceptEditor = createInlineSessionEditor();
			const acceptBlockId = acceptEditor.firstBlock()!.id;
			acceptEditor.apply(
				[{ type: "insert-text", blockId: acceptBlockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			acceptEditor.selectTextRange(
				{ blockId: acceptBlockId, offset: 6 },
				{ blockId: acceptBlockId, offset: 11 },
			);
			const acceptController = getAIController(acceptEditor)!;
			const acceptSession = acceptController.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			await acceptController.runSessionPrompt(
				acceptSession.id,
				"Rewrite the selection",
			);

			expect(acceptController.resolveSession(acceptSession.id, "accept")).toBe(true);
			expect(
				acceptController.getActiveSession()?.contextualPrompt?.composer.isOpen,
			).toBe(false);

			const rejectEditor = createInlineSessionEditor();
			const rejectBlockId = rejectEditor.firstBlock()!.id;
			rejectEditor.apply(
				[{ type: "insert-text", blockId: rejectBlockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			rejectEditor.selectTextRange(
				{ blockId: rejectBlockId, offset: 6 },
				{ blockId: rejectBlockId, offset: 11 },
			);
			const rejectController = getAIController(rejectEditor)!;
			const rejectSession = rejectController.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			await rejectController.runSessionPrompt(
				rejectSession.id,
				"Rewrite the selection",
			);

			expect(rejectController.resolveSession(rejectSession.id, "reject")).toBe(true);
			expect(
				rejectController.getActiveSession()?.contextualPrompt?.composer.isOpen,
			).toBe(false);
		});

	it("closes the inline composer when resolving a session turn", async () => {
			const createInlineSessionEditor = () =>
				createEditor({
					extensions: [
						aiExtension({
							model: {
								async *stream() {
									yield { type: "text-delta" as const, delta: "planet" };
									yield { type: "done" as const };
								},
							},
						}),
					],
				});

			const acceptEditor = createInlineSessionEditor();
			const acceptBlockId = acceptEditor.firstBlock()!.id;
			acceptEditor.apply(
				[{ type: "insert-text", blockId: acceptBlockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			acceptEditor.selectTextRange(
				{ blockId: acceptBlockId, offset: 6 },
				{ blockId: acceptBlockId, offset: 11 },
			);
			const acceptController = getAIController(acceptEditor)!;
			const acceptSession = acceptController.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			await acceptController.runSessionPrompt(
				acceptSession.id,
				"Rewrite the selection",
			);
			const acceptedTurnId = acceptController.getActiveSession()?.turns[0]?.id;

			expect(
				acceptController.resolveSessionTurn(
					acceptSession.id,
					acceptedTurnId!,
					"accept",
				),
			).toBe(true);
			expect(
				acceptController.getActiveSession()?.contextualPrompt?.composer.isOpen,
			).toBe(false);

			const rejectEditor = createInlineSessionEditor();
			const rejectBlockId = rejectEditor.firstBlock()!.id;
			rejectEditor.apply(
				[{ type: "insert-text", blockId: rejectBlockId, offset: 0, text: "Hello world" }],
				{ origin: "system" },
			);
			rejectEditor.selectTextRange(
				{ blockId: rejectBlockId, offset: 6 },
				{ blockId: rejectBlockId, offset: 11 },
			);
			const rejectController = getAIController(rejectEditor)!;
			const rejectSession = rejectController.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			await rejectController.runSessionPrompt(
				rejectSession.id,
				"Rewrite the selection",
			);
			const rejectedTurnId = rejectController.getActiveSession()?.turns[0]?.id;

			expect(
				rejectController.resolveSessionTurn(
					rejectSession.id,
					rejectedTurnId!,
					"reject",
				),
			).toBe(true);
			expect(
				rejectController.getActiveSession()?.contextualPrompt?.composer.isOpen,
			).toBe(false);
		});

	it("uses the captured inline session selection even if the editor selection changes", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "planet" };
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
			const session = controller.startSession({
				surface: "inline-edit",
				target: "selection",
			});

			editor.selectTextRange(
				{ blockId, offset: 0 },
				{ blockId, offset: 5 },
			);

			const generation = await controller.runSessionPrompt(
				session.id,
				"Rewrite the selection",
			);

			expect(generation.status).toBe("complete");
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
				"Hello planet",
			);
		});

	it("routes inline session continue prompts to block streaming suggestions", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: " More detail" };
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
			const session = controller.startSession({
				surface: "inline-edit",
				target: "selection",
			});

			const generation = await controller.runSessionPrompt(
				session.id,
				"Continue this paragraph",
			);

			expect(generation.target).toBe("selection");
			expect(generation.mutationMode).toBe("streaming-suggestions");
			expect(editor.getBlock(blockId)!.textContent()).toContain("Hello world");
			expect(controller.getSuggestions().length).toBeGreaterThan(0);
		});
});
