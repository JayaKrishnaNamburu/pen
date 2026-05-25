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
	it("treats whole-document rewrite prompts as explicit multi-block replace plans", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "# The Founder's Last Email\n\nA startup story set in Amsterdam.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "The Lighthouse Keeper's Last Letter" },
					{
						type: "insert-block",
						blockId: "paragraph-2",
						blockType: "paragraph",
						props: {},
						position: { after: firstBlockId },
					},
					{
						type: "insert-text",
						blockId: "paragraph-2",
						offset: 0,
						text: "The storm had been building for three days.",
					},
				],
				{ origin: "system" },
			);
			const originalBlockIds = [...editor.documentState.blockOrder];

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Rewrite the whole story. Make it about a startup from Amsterdam.",
				{ target: "document" },
			);

			const activeSession = controller.getSessions().find((item) => item.id === session.id);
			expect(activeSession?.operation?.kind).toBe("rewrite-selection");
			expect(activeSession?.operation?.target.kind).toBe("scoped-range");
			const documentTarget =
				activeSession?.operation?.target.kind === "scoped-range"
					? activeSession.operation.target
					: null;
			expect(documentTarget?.blockIds).toEqual(originalBlockIds);
			expect(documentTarget?.contentFormat).toBe("markdown");
			expect(documentTarget?.scope).toBe("document");
			expect(generation.status).toBe("complete");
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			const turnId = activeSession?.turns[0]?.id;
			expect(turnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);

			const finalVisibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(finalVisibleBlockTexts).toEqual([
				"The Founder's Last Email",
				"A startup story set in Amsterdam.",
			]);
		});

	it("treats rewrite-the-story prompts as explicit multi-block replace plans", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "# The Pharaoh's Last Scroll\n\nA cat story set in Egypt.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[
					{
						type: "insert-text",
						blockId: firstBlockId,
						offset: 0,
						text: "The Founder's Last Email",
					},
					{
						type: "insert-block",
						blockId: "paragraph-2",
						blockType: "paragraph",
						props: {},
						position: { after: firstBlockId },
					},
					{
						type: "insert-text",
						blockId: "paragraph-2",
						offset: 0,
						text: "The Slack notification had been pinging for three days.",
					},
				],
				{ origin: "system" },
			);
			const originalBlockIds = [...editor.documentState.blockOrder];

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Rewrite the story. Make it about a cat from Egypt.",
				{ target: "document" },
			);

			const activeSession = controller.getSessions().find((item) => item.id === session.id);
			expect(activeSession?.operation?.kind).toBe("rewrite-selection");
			expect(activeSession?.operation?.target.kind).toBe("scoped-range");
			const documentTarget =
				activeSession?.operation?.target.kind === "scoped-range"
					? activeSession.operation.target
					: null;
			expect(documentTarget?.blockIds).toEqual(originalBlockIds);
			expect(documentTarget?.contentFormat).toBe("markdown");
			expect(documentTarget?.scope).toBe("document");
			expect(generation.status).toBe("complete");
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			const turnId = activeSession?.turns[0]?.id;
			expect(turnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);

			const finalVisibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(finalVisibleBlockTexts).toEqual([
				"The Pharaoh's Last Scroll",
				"A cat story set in Egypt.",
			]);
		});

	it("carries bottom-chat history into follow-up title edits and replaces prior generated blocks", async () => {
			const capturedPrompts: string[] = [];
			let streamCount = 0;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								streamCount += 1;
								capturedPrompts.push(
									options.messages
										.map((message) =>
											typeof message.content === "string"
												? message.content
												: JSON.stringify(message.content),
										)
										.join("\n\n"),
								);
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text:
										streamCount === 1
											? "# Salt and Shadow\n\nA lighthouse story."
											: "# Amsterdam Sprint\n\nA startup story with a new title.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			await controller.runSessionPrompt(session.id, "Write a story", {
				target: "document",
			});

			const firstTurnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(firstTurnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, firstTurnId!)).toBe(true);

			await controller.runSessionPrompt(
				session.id,
				"Also change the title.",
				{ target: "document" },
			);

			expect(capturedPrompts[1]).toContain(
				"Earlier user requests in this same session:",
			);
			expect(capturedPrompts[1]).toContain("1. Write a story");
			expect(capturedPrompts[1]).toContain(
				"Latest request:\nAlso change the title.",
			);
			const activeSession = controller.getSessions().find((item) => item.id === session.id);
			expect(activeSession?.operation?.kind).toBe("rewrite-selection");
			expect(activeSession?.operation?.target.kind).toBe("scoped-range");
			const documentTarget =
				activeSession?.operation?.target.kind === "scoped-range"
					? activeSession.operation.target
					: null;
			expect(documentTarget?.scope).toBe("heading");
			expect(documentTarget?.contentFormat).toBe("markdown");
			expect(documentTarget?.blockIds).toHaveLength(1);
		});

	it("replaces the previous story after accepting a follow-up make-it-about rewrite", async () => {
			let streamCount = 0;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								streamCount += 1;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text:
										streamCount === 1
											? "# The Lighthouse Keeper's Last Signal\n\nA lighthouse story."
											: "# The Cat Keeper's Last Purr\n\nA cat story.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});

			await controller.runSessionPrompt(session.id, "Write a story", {
				target: "document",
			});
			const firstTurnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(firstTurnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, firstTurnId!)).toBe(true);

			await controller.runSessionPrompt(session.id, "Actually make it about cats", {
				target: "document",
			});
			const secondTurnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[1]?.id ?? null;
			expect(secondTurnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, secondTurnId!)).toBe(true);

			const finalVisibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(finalVisibleBlockTexts).toEqual([
				"The Cat Keeper's Last Purr",
				"A cat story.",
			]);
		});
});
