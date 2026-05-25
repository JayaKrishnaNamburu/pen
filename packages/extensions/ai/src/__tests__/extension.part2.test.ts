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
	it("keeps document-targeted bottom-chat rewrites off selection-fast even with a live selection", async () => {
			let requestMode: string | undefined;
			let operationKind: string | undefined;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "text",
						},
						model: {
							async *stream(options) {
								requestMode = options.requestMode;
								operationKind = options.operation?.kind;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "planet",
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
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			await controller.runSessionPrompt(session.id, "Rewrite this");

			expect(requestMode).toBe("selection-fast");
			expect(operationKind).toBe("rewrite-selection");
		});

	it("routes bottom-chat block rewrites through typed local replace operations", async () => {
			let requestMode: string | undefined;
			let operationKind: string | undefined;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "text",
						},
						model: {
							async *stream(options) {
								requestMode = options.requestMode;
								operationKind = options.operation?.kind;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "Hello planet",
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
				{ blockId, offset: 5 },
				{ blockId, offset: 5 },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
			});
			const generation = await controller.runSessionPrompt(session.id, "Rewrite this");

			expect(requestMode).toBe("selection-fast");
			expect(operationKind).toBe("rewrite-selection");
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			const turnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(turnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);
			expect(editor.firstBlock()!.textContent({ resolved: true })).toBe(
				"Hello planet",
			);
		});

	it("routes whole-document rewrites through typed local replace operations", async () => {
			let operation:
				| {
					kind?: string;
					target?: {
						kind?: string;
						blockIds?: readonly string[];
						contentFormat?: string;
						scope?: string;
					};
				}
				| undefined;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								operation = options.operation;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "# The Cat Keeper\n\nA cat story.",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "insert-text", blockId, offset: 0, text: "The Lighthouse Keeper" },
					{ type: "convert-block", blockId, newType: "heading" },
					{
						type: "insert-block",
						blockId: "paragraph-1",
						blockType: "paragraph",
						props: {},
						position: { after: blockId },
					},
					{
						type: "insert-text",
						blockId: "paragraph-1",
						offset: 0,
						text: "A lighthouse story.",
					},
				],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Rewrite the whole story. Make it about cats.",
				{ target: "document" },
			);

			expect(operation?.kind).toBe("rewrite-selection");
			expect(operation?.target?.kind).toBe("scoped-range");
			expect(operation?.target?.contentFormat).toBe("markdown");
			expect(operation?.target?.scope).toBe("document");
			expect(operation?.target?.blockIds).toContain("paragraph-1");
			expect(operation?.target?.blockIds).toHaveLength(2);
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			const turnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(turnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);
			const visibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(visibleBlockTexts).toEqual(["The Cat Keeper", "A cat story."]);
		});

	it("routes remove-all document edits through typed local delete suggestions", async () => {
			let operation:
				| {
					kind?: string;
					target?: {
						kind?: string;
						blockIds?: readonly string[];
						contentFormat?: string;
						scope?: string;
					};
				}
				| undefined;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "markdown",
						},
						model: {
							async *stream(options) {
								operation = options.operation;
								yield {
									type: "replace-final" as const,
									operation: options.operation!,
									text: "",
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

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
				target: "document",
			});
			const generation = await controller.runSessionPrompt(
				session.id,
				"Remove all content in the document.",
				{ target: "document" },
			);

			expect(operation).toMatchObject({
				kind: "rewrite-selection",
				target: {
					kind: "scoped-range",
					blockIds: editor.documentState.blockOrder,
					contentFormat: "markdown",
					scope: "document",
				},
			});
			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			const turnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(turnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);
			const visibleBlockTexts = editor.documentState.blockOrder
				.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
				.filter((text) => text.trim().length > 0);
			expect(visibleBlockTexts).toEqual([]);
		});

	it("keeps heading rewrites block-bounded instead of inserting a new markdown block", async () => {
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
									text: "# The Keeper's Final Watch",
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			const blockId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "insert-text", blockId, offset: 0, text: "The Lighthouse Keeper's Last Night" },
					{ type: "convert-block", blockId, newType: "heading" },
				],
				{ origin: "system" },
			);
			editor.selectTextRange(
				{ blockId, offset: 0 },
				{ blockId, offset: 0 },
			);

			const controller = getAIController(editor)!;
			const session = controller.startSession({
				surface: "bottom-chat",
			});
			const generation = await controller.runSessionPrompt(session.id, "Rewrite this");

			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
			const turnId =
				controller
					.getSessions()
					.find((item) => item.id === session.id)
					?.turns[0]?.id ?? null;
			expect(turnId).toBeTruthy();
			expect(controller.acceptSessionTurn(session.id, turnId!)).toBe(true);
			expect(editor.firstBlock()?.type).toBe("heading");
			expect(editor.firstBlock()!.textContent({ resolved: true })).toBe(
				"The Keeper's Final Watch",
			);
			expect(editor.documentState.blockOrder).toHaveLength(1);
		});

	it("routes bottom-chat continue prompts to typed insert operations", async () => {
			let operationKind: string | undefined;
			const editor = createEditor({
				extensions: [
					aiExtension({
						contentFormat: {
							blockGeneration: "text",
						},
						model: {
							async *stream(options) {
								operationKind = options.operation?.kind;
								yield {
									type: "insert-final" as const,
									operation: options.operation!,
									text: " and beyond",
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
			const session = controller.startSession({
				surface: "bottom-chat",
			});
			await controller.runSessionPrompt(session.id, "Continue writing");

			expect(operationKind).toBe("continue-block");
			expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
				"Hello world and beyond",
			);
		});
});
