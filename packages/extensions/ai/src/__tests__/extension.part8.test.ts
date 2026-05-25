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
	it("routes inline local-edit prompts to block streaming suggestions", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: " Better version" };
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
				"Make it better",
			);

			expect(generation.target).toBe("selection");
			expect(generation.mutationMode).toBe("streaming-suggestions");
			expect(controller.getSuggestions().length).toBeGreaterThan(0);
		});

	it("uses the live collapsed caret offset for block generations", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: " AI" };
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
				{ blockId, offset: 5 },
				{ blockId, offset: 5 },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Continue this paragraph", {
				target: "block",
				blockId,
			});

			expect(generation.target).toBe("block");
			const suggestions = controller.getSuggestions();
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions[0]).toMatchObject({
				blockId,
				offset: 5,
			});
		});

	it("uses the selection end as the insertion offset for inline block turns", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: " Better" };
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
				"Make it better",
			);

			expect(generation.target).toBe("selection");
			expect(generation.mutationMode).toBe("streaming-suggestions");
			const suggestions = controller.getSuggestions();
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions[0]?.blockId).toBe(blockId);
		});

	it("creates reviewable cross-block inline edit suggestions", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield { type: "text-delta" as const, delta: "X" };
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply([
				{
					type: "insert-block",
					blockId: "b2",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				{
					type: "insert-block",
					blockId: "b3",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
				{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Hello" },
				{ type: "insert-text", blockId: "b2", offset: 0, text: "World" },
				{ type: "insert-text", blockId: "b3", offset: 0, text: "Again" },
			]);
			editor.selectTextRange(
				{ blockId: firstBlockId, offset: 2 },
				{ blockId: "b3", offset: 2 },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Rewrite the selection",
			);
			const nextSession = controller.getActiveSession();
			const turn = nextSession?.turns[0];

			expect(generation.suggestionIds?.length ?? 0).toBeGreaterThan(0);
			expect(turn?.selection?.isMultiBlock).toBe(true);
			expect(turn?.status).toBe("review");
			expect(controller.acceptSessionTurn(session.id, turn!.id)).toBe(true);
			expect(editor.getBlock(firstBlockId)?.textContent({ resolved: true })).toBe("HeXain");
			expect(editor.getBlock("b2")).toBeNull();
			expect(editor.getBlock("b3")).toBeNull();
		});

	it("records progressive tool stream events for the active generation", async () => {
			let pass = 0;
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								pass += 1;
								if (pass === 1) {
									yield {
										type: "tool-call" as const,
										toolCallId: "tool-call-1",
										toolName: "test_search",
										input: { query: "plan" },
									};
								}
								yield { type: "done" as const };
							},
						},
					}),
					testStreamingToolExtension(),
				],
			});
			const controller = getAIController(editor)!;
			const blockId = editor.firstBlock()!.id;

			const generation = await controller.runPrompt("search the document", { blockId });
			const streamEvents = controller.getStreamEvents();
			const streamEventTypes = streamEvents.map((event) => event.type);
			const toolOutputEvents = streamEvents.filter(
				(event) => event.type === "tool-output",
			);
			const toolResultEvent = streamEvents.find(
				(event) => event.type === "tool-result",
			);

			expect(generation.status).toBe("complete");
			expect(streamEventTypes).toEqual([
				"generation-start",
				"status",
				"tool-call",
				"status",
				"tool-output",
				"tool-output",
				"tool-result",
				"status",
				"generation-finish",
			]);
			expect(toolOutputEvents).toHaveLength(2);
			expect(toolOutputEvents[0]).toMatchObject({
				toolCallId: "tool-call-1",
				toolName: "test_search",
				part: "searching:plan",
				output: "searching:plan",
			});
			expect(toolOutputEvents[1]).toMatchObject({
				toolCallId: "tool-call-1",
				toolName: "test_search",
				part: { matches: 2, query: "plan" },
				output: ["searching:plan", { matches: 2, query: "plan" }],
			});
			expect(toolResultEvent).toMatchObject({
				type: "tool-result",
				toolCallId: "tool-call-1",
				toolName: "test_search",
				output: ["searching:plan", { matches: 2, query: "plan" }],
				state: "complete",
			});
		});

	it("streams block structured previews before a block plan finishes", async () => {
			const releaseSecondDelta = createDeferred();
			let streamedBlockId = "";
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta:
										`{"kind":"block_convert","blockId":"${streamedBlockId}","newType":"heading"`,
								};
								await releaseSecondDelta.promise;
								yield {
									type: "text-delta" as const,
									delta: ',"props":{"level":2}}',
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			streamedBlockId = blockId;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const generationPromise = controller.runPrompt("Convert block to heading", {
				blockId,
			});
			await waitForPreview(
				() => controller.getState().activeGeneration?.structuredPreview,
			);

			const activeGeneration = controller.getState().activeGeneration;
			const previewEventsBeforeCompletion = controller.getStreamEvents().filter(
				(event) => event.type === "structured-preview",
			);
			expect(activeGeneration?.structuredPreview).toMatchObject({
				planState: "drafted",
				plan: {
					kind: "block_convert",
					blockId,
					newType: "heading",
				},
			});
			expect(activeGeneration?.structuredPreview?.reviewItems).toEqual([
				expect.objectContaining({
					label: "Convert block",
					section: "block",
					changeKind: "updated",
				}),
			]);
			expect(controller.getStreamEvents().some((event) => (
				event.type === "structured-preview" &&
				event.preview.plan.kind === "block_convert"
			))).toBe(true);
			expect(previewEventsBeforeCompletion).toHaveLength(1);
			expect(previewEventsBeforeCompletion[0]).toMatchObject({
				patches: [
					{ op: "add", path: "/planState", value: "drafted" },
					{ op: "add", path: "/plan", value: expect.any(Object) },
					{ op: "add", path: "/reviewItems", value: expect.any(Array) },
					{ op: "add", path: "/targets", value: [] },
				],
			});

			releaseSecondDelta.resolve();
			const generation = await generationPromise;
			const previewEventsAfterCompletion = controller.getStreamEvents().filter(
				(event) => event.type === "structured-preview",
			);
			const finalPreviewEvent =
				previewEventsAfterCompletion[previewEventsAfterCompletion.length - 1];
			expect(generation.structuredPreview).toMatchObject({
				planState: "validated",
				plan: {
					kind: "block_convert",
					blockId,
					newType: "heading",
					props: { level: 2 },
				},
			});
			expect(finalPreviewEvent).toMatchObject({
				patches: [
					{ op: "replace", path: "/planState", value: "validated" },
					{ op: "add", path: "/plan/props", value: {} },
					{ op: "add", path: "/plan/props/level", value: 2 },
				],
			});
			expect(
				finalPreviewEvent?.patches.some((patch) => patch.path === "/plan"),
			).toBe(false);
		});
});
