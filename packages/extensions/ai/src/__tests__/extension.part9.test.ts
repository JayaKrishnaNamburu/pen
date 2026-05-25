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
	it("keeps selection rewrites text-only when markdown block generation is enabled", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: { blockGeneration: "markdown" },
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: "# Planet",
								};
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
			const generation = await controller.runPrompt("Rewrite the selection");

			expect(generation.status).toBe("complete");
			expect(generation.contentFormat).toBe("text");
			expect(editor.getBlock(blockId)!.textContent()).toBe("Hello world# Planet");
			expect(editor.documentState.blockOrder).toHaveLength(1);
		});

	it("routes context-first block edits into persistent suggestions", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: " Updated" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Improve this paragraph", { blockId });
			const block = editor.getBlock(blockId)!;

			expect(generation.route).toBe("context-first");
			expect(generation.mutationMode).toBe("persistent-suggestions");
			expect(block.textContent()).toBe("Hello Updated");
			expect(controller.getSuggestions().length).toBeGreaterThan(0);
		});

	it("uses markdown block generation for bottom-chat document writing", async () => {
			const releaseFinalDelta = createDeferred();
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
							selectionRewrite: "text",
						},
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "Once upon " };
								await releaseFinalDelta.promise;
								yield { type: "text-delta" as const, delta: "a time" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generationPromise = controller.runSessionPrompt(
				session.id,
				"Write a short story",
				{ target: "document" },
			);

			await waitForPreview(() => {
				const activeGeneration = controller.getState().activeGeneration;
				const streamedVisibleBlockTexts = editor.documentState.blockOrder
					.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
					.filter((text) => text.trim().length > 0);
				return (
					activeGeneration?.surface === "bottom-chat" &&
					activeGeneration.contentFormat === "markdown" &&
					streamedVisibleBlockTexts.includes("Once upon")
				);
			});

			const streamedVisibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);

			expect(controller.getState().activeGeneration?.surface).toBe("bottom-chat");
			expect(controller.getState().activeGeneration?.contentFormat).toBe("markdown");
			expect(controller.getState().activeGeneration?.mutationMode).toBe(
				"streaming-suggestions",
			);
			expect(streamedVisibleBlockTexts).toEqual(["Hello", "Once upon"]);
			expect(session.surface).toBe("bottom-chat");

			releaseFinalDelta.resolve();
			const generation = await generationPromise;
			const visibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(generation.status).toBe("complete");
			expect(generation.mutationMode).toBe("streaming-suggestions");
			expect(generation.contentFormat).toBe("markdown");
			expect(generation.adapterId).toBe("flow-markdown");
			expect(generation.blockClass).toBe("flow");
			expect(generation.transportKind).toBe("flow-text");
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			expect(generation.suggestionIds?.length ?? 0).toBeGreaterThan(0);
			expect(visibleBlockTexts).toEqual(["Hello", "Once upon a time"]);
		});

	it("streams bottom-chat markdown as block suggestions before completion", async () => {
			const releaseFinalDelta = createDeferred();
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
							selectionRewrite: "text",
						},
						model: {
							async *stream(options) {
								yield {
									type: "replace-preview" as const,
									operation: options.operation!,
									text: "\n\nOnce upon ",
								};
								await releaseFinalDelta.promise;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "\n\nOnce upon a time",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generationPromise = controller.runSessionPrompt(
				session.id,
				"Write a short story",
				{ target: "document" },
			);

			await new Promise((resolve) => setTimeout(resolve, 80));

			expect(controller.getState().activeGeneration?.surface).toBe("bottom-chat");
			expect(controller.getState().activeGeneration?.contentFormat).toBe("markdown");
			const visibleStreamingTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(
				(editor.getBlock(blockId)?.textContent({ resolved: true }) ?? "").replace(
					/^\u200b/,
					"",
				),
			).toBe("");
			expect(visibleStreamingTexts).toEqual(["Once upon"]);

			releaseFinalDelta.resolve();
			const generation = await generationPromise;

			expect(generation.status).toBe("complete");
			expect(generation.contentFormat).toBe("markdown");
			expect(generation.text).toBe("\n\nOnce upon a time");
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			expect(generation.suggestionIds?.length ?? 0).toBeGreaterThan(0);
			const visibleFinalTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(visibleFinalTexts).toEqual(["Once upon a time"]);
			const turnId = controller
				.getState()
				.sessions.find((item) => item.id === session.id)
				?.turns[0]?.id;
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);
			const keptTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(keptTexts).toEqual(["Once upon a time"]);
		});

	it("allows inline selection edits after keeping bottom-chat changes", async () => {
			let pass = 0;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
							selectionRewrite: "text",
						},
						model: {
							async *stream(options) {
								pass += 1;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: pass === 1 ? "Hello world" : "planet",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});

			const controller = getAIController(editor)!;
			const bottomChatSession = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			await controller.runSessionPrompt(
				bottomChatSession.id,
				"Write something in the document",
				{ target: "document" },
			);

			const keptTurnId = controller
				.getSessions()
				.find((session) => session.id === bottomChatSession.id)
				?.turns[0]?.id;
			expect(keptTurnId).toBeTruthy();
			expect(controller.acceptSessionTurn(bottomChatSession.id, keptTurnId!)).toBe(true);

			const blockId = editor.firstBlock()!.id;
			editor.selectTextRange(
				{ blockId, offset: 6 },
				{ blockId, offset: 11 },
			);

			const inlineSession = controller.openContextualPrompt({
				surface: "inline-edit",
				target: "selection",
			});
			expect(inlineSession).not.toBeNull();

			const generation = await controller.runSessionPrompt(
				inlineSession!.id,
				"Rewrite the selection",
				{ target: "selection" },
			);

			expect(generation.target).toBe("selection");
			expect(
				controller
					.getSessions()
					.find((session) => session.id === inlineSession!.id)
					?.turns,
			).toHaveLength(1);
		});
});
