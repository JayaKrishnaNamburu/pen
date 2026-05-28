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
	it("applies XML flow patch plans through the markdown fast-apply path", async () => {
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: [
										"<pen-fast-apply>",
										"<instructions>I am replacing the current table with an updated version.</instructions>",
										"<scope>adjacent-blocks</scope>",
										"<targetSpanId>span:table-1</targetSpanId>",
										"<edit>",
										"<operation>replace_blocks</operation>",
										"<block>table-1</block>",
										"<expectedBlockType>table</expectedBlockType>",
										"<markdown><![CDATA[| Name | Role |",
										"| --- | --- |",
										"| Alice | Design |",
										"| Bob | Engineering |]]></markdown>",
										"</edit>",
										"</pen-fast-apply>",
									].join("\n"),
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
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
					{
						type: "insert-block",
						blockId: "table-1",
						blockType: "table",
						props: {},
						position: { after: firstBlockId },
					},
				],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Add a role column to this table", {
				blockId: "table-1",
			});

			expect(generation.mutationReceipt?.status).toBe("staged_suggestions");

			expect(controller.acceptActiveGeneration()).toBe(true);
			const tables = Array.from(editor.blocks("table"));
			expect(tables).toHaveLength(1);
			expect(tables[0]?.tableColumnCount()).toBe(2);
			expect(tables[0]?.tableRowCount()).toBe(3);
			expect(tables[0]?.tableCell(1, 1)?.textContent()).toBe("Design");
		});

	it("records flow patch alignment metrics in fast-apply debug state", () => {
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
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Alpha" },
					{
						type: "insert-block",
						blockId: "block-2",
						blockType: "paragraph",
						props: {},
						position: { after: firstBlockId },
					},
					{
						type: "insert-text",
						blockId: "block-2",
						offset: 0,
						text: "Bravo",
					},
					{
						type: "insert-block",
						blockId: "block-3",
						blockType: "paragraph",
						props: {},
						position: { after: "block-2" },
					},
					{
						type: "insert-text",
						blockId: "block-3",
						offset: 0,
						text: "Charlie",
					},
				],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const controllerAny = controller as any;
			controllerAny._state.activeGeneration = {
				id: "test-generation",
				debug: {
					messageAssemblyLatencyMs: 0,
					firstToolStartMs: null,
					firstToolResultMs: null,
					firstVisibleTextMs: null,
					toolExecutionMs: 0,
					qualitySignals: {},
				},
			};

			const mutationReceipt = controllerAny._commitBufferedMarkdownFastApply(
				firstBlockId,
				[
					"<pen-fast-apply>",
					"<instructions>I am inserting a new paragraph between Bravo and Charlie.</instructions>",
					"<scope>adjacent-blocks</scope>",
					`<targetSpanId>span:${firstBlockId}</targetSpanId>`,
					"<edit>",
					"<operation>replace_blocks</operation>",
					`<block>${firstBlockId}</block>`,
					"<block>block-2</block>",
					"<block>block-3</block>",
					"<markdown><![CDATA[Alpha",
					"",
					"Bravo",
					"",
					"Inserted middle",
					"",
					"Charlie]]></markdown>",
					"</edit>",
					"</pen-fast-apply>",
				].join("\n"),
				"persistent-suggestions",
				undefined,
				{
					context: {
						markdown: ["Alpha", "", "Bravo", "", "Charlie"].join("\n"),
						markdownWindow: {
							blockIds: [firstBlockId, "block-2", "block-3"],
						},
					},
				},
			);

			expect(mutationReceipt?.status).toBe("staged_suggestions");
			expect(controller.getState().activeGeneration?.debug?.fastApply).toMatchObject({
				attempted: true,
				succeeded: true,
				executionPath: "native-fast-apply",
				alignment: {
					preservedBlockCount: 3,
					rewrittenBlockCount: 0,
					unchangedBlockCount: 3,
					insertedBlockCount: 1,
					deletedBlockCount: 0,
					estimatedOperationCost: 2,
				},
			});
		});

	it("records scoped replacement fallback metrics in fast-apply debug state", () => {
			const editor = createEditor({
				extensions: [aiExtension({})],
			});
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[
					{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Alpha" },
					{
						type: "insert-block",
						blockId: "block-2",
						blockType: "paragraph",
						props: {},
						position: { after: firstBlockId },
					},
					{
						type: "insert-text",
						blockId: "block-2",
						offset: 0,
						text: "Charlie",
					},
				],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const controllerAny = controller as any;
			controllerAny._state.activeGeneration = {
				id: "test-generation",
				debug: {
					messageAssemblyLatencyMs: 0,
					firstToolStartMs: null,
					firstToolResultMs: null,
					firstVisibleTextMs: null,
					toolExecutionMs: 0,
					qualitySignals: {},
				},
			};

			const mutationReceipt = controllerAny._commitBufferedMarkdownFastApply(
				firstBlockId,
				[
					"<pen-fast-apply>",
					"<instructions>I am inserting a middle paragraph.</instructions>",
					"<anchorBefore><![CDATA[Alpha]]></anchorBefore>",
					"<anchorAfter><![CDATA[Charlie]]></anchorAfter>",
					"<patch><![CDATA[<!-- ... existing markdown ... -->",
					"",
					"Bravo",
					"",
					"<!-- ... existing markdown ... -->]]></patch>",
					"</pen-fast-apply>",
				].join("\n"),
				"persistent-suggestions",
				undefined,
				{
					context: {
						markdown: ["Alpha", "", "Charlie"].join("\n"),
						markdownWindow: {
							blockIds: [firstBlockId, "block-2"],
						},
					},
				},
			);

			expect(mutationReceipt?.status).toBe("staged_suggestions");
			expect(controller.getState().activeGeneration?.debug?.fastApply).toMatchObject({
				attempted: true,
				succeeded: true,
				executionPath: "scoped-replacement",
				fallback: {
					kind: "scoped-replacement",
					opsCount: 8,
					insertedBlockCount: 3,
					deletedBlockCount: 2,
					targetBlockCount: 2,
				},
			});
		});

	it("records plain markdown fallback metrics when fast-apply falls back to block generation", () => {
			const editor = createEditor({
				extensions: [aiExtension({ contentFormat: { blockGeneration: "markdown" } })],
			});
			const firstBlockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const controllerAny = controller as any;
			controllerAny._state.activeGeneration = {
				id: "test-generation",
				debug: {
					messageAssemblyLatencyMs: 0,
					firstToolStartMs: null,
					firstToolResultMs: null,
					firstVisibleTextMs: null,
					toolExecutionMs: 0,
					qualitySignals: {},
				},
			};

			const mutationReceipt = controllerAny._commitBufferedBlockGeneration(
				firstBlockId,
				"## Replacement title",
				"persistent-suggestions",
				"markdown",
				undefined,
				{
					applyStrategy: "markdown-fast-apply",
					workingSet: {
						context: {
							markdown: "Hello",
							markdownWindow: {
								blockIds: [firstBlockId],
							},
						},
					},
				},
			);

			expect(mutationReceipt?.status).toBe("staged_suggestions");
			expect(controller.getState().activeGeneration?.debug?.fastApply).toMatchObject({
				attempted: true,
				succeeded: false,
				fallbackReason: "unparseable-contract",
				executionPath: "plain-markdown",
				fallback: {
					kind: "plain-markdown",
					opsCount: 2,
					insertedBlockCount: 1,
					deletedBlockCount: 0,
				},
			});
		});

	it("executes review-safe block convert plans through the existing suggestion path", async () => {
			let blockId = "";
			const editor = createEditor({
				extensions: [
					aiExtension({
						model: {
							async *stream() {
								yield {
									type: "text-delta" as const,
									delta: JSON.stringify({
										kind: "block_convert",
										blockId,
										newType: "heading",
										props: { level: 2 },
									}),
								};
								yield { type: "done" as const };
							},
						},
					}),
				],
			});
			blockId = editor.firstBlock()!.id;
			editor.apply(
				[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
				{ origin: "system" },
			);

			const controller = getAIController(editor)!;
			const generation = await controller.runPrompt("Convert block to heading", {
				blockId,
			});
			const block = editor.getBlock(blockId)!;

			expect(generation.planState).toBe("validated");
			expect(generation.plan).toMatchObject({
				kind: "block_convert",
				blockId,
				newType: "heading",
			});
			expect(block.type).toBe("heading");
			expect(block.meta("suggestion")).toMatchObject({
				action: "convert-block",
				authorType: "ai",
			});
		});
});
