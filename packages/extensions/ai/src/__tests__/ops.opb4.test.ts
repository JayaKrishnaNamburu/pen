import { buildSplitBlockRecipe, createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { DocumentOp } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { transformOpsForSuggestModeWithMetadata } from "../suggestions/suggestMode";

describe("ops op-boundary OPB4", () => {
	it("OPB4: suggest-mode renders a split from intent pen.splitBlock, not from op-shape sniffing", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello world",
			},
		]);
		const recipe = buildSplitBlockRecipe({
			block: editor.getBlock(blockId)!,
			offset: 6,
			newBlockId: "dest",
		});

		const withoutIntent = transformOpsForSuggestModeWithMetadata(
			recipe.ops,
			editor,
			"assistant",
			"ai",
			"test-model",
			"session-1",
			{ suggestionIds: ["suggestion-insert"] },
		);
		const withIntent = transformOpsForSuggestModeWithMetadata(
			recipe.ops,
			editor,
			"assistant",
			"ai",
			"test-model",
			"session-1",
			{
				origin: { type: "ai", intent: "pen.splitBlock" },
				suggestionIds: ["suggestion-split"],
			},
		);

		expect(withoutIntent.suggestions).toContainEqual(
			expect.objectContaining({
				kind: "block",
				action: "insert-block",
				id: "suggestion-insert",
			}),
		);
		expect(
			withoutIntent.suggestions.some(
				(suggestion) =>
					suggestion.kind === "block" && suggestion.action === "split-block",
			),
		).toBe(false);
		expect(withIntent.suggestions).toContainEqual(
			expect.objectContaining({
				kind: "block",
				action: "split-block",
				id: "suggestion-split",
			}),
		);
		editor.destroy();
	});

	it("OPB4: interception matches primitives (splice-text and set-props) instead of deleted compound types", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Hi",
			},
		]);

		const splice = transformOpsForSuggestModeWithMetadata(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 2,
					insert: "X",
				},
			],
			editor,
			"assistant",
			"ai",
			"test-model",
			"session-1",
			{ suggestionIds: ["suggestion-delete", "suggestion-insert"] },
		);
		expect(splice.suggestions).toEqual([
			expect.objectContaining({
				kind: "text",
				action: "delete",
				id: "suggestion-delete",
			}),
			expect.objectContaining({
				kind: "text",
				action: "insert",
				id: "suggestion-insert",
			}),
		]);

		const convert = transformOpsForSuggestModeWithMetadata(
			[{ type: "set-props", blockId, props: { type: "heading" } }],
			editor,
			"assistant",
			"ai",
			"test-model",
			"session-1",
			{ suggestionIds: ["suggestion-convert"] },
		);
		expect(convert.suggestions).toContainEqual(
			expect.objectContaining({
				kind: "block",
				action: "convert-block",
				id: "suggestion-convert",
			}),
		);
		editor.destroy();
	});

	it("OPB4: suggest-mode walks all ten primitives without throwing", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		const ops: DocumentOp[] = [
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "x",
			},
			{
				type: "format-text",
				blockId,
				from: 0,
				to: 0,
				marks: { bold: true },
			},
			{
				type: "insert-block",
				blockId: "p2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "delete-block", blockId: "p2" },
			{ type: "move-block", blockId, position: "last" },
			{ type: "set-props", blockId, props: { indent: 1 } },
			{ type: "set-meta", blockId, namespace: "note", data: { a: 1 } },
			{
				type: "grid",
				blockId,
				change: { kind: "insert-row", index: 0 },
			},
			{
				type: "app",
				change: { kind: "delete", appId: "app-1" },
			},
			{ type: "stream-open", blockId },
		];
		const seen: DocumentOp["type"][] = [];
		for (const op of ops) {
			switch (op.type) {
				case "splice-text":
				case "format-text":
				case "insert-block":
				case "delete-block":
				case "move-block":
				case "set-props":
				case "set-meta":
				case "grid":
				case "app":
				case "stream-open":
					seen.push(op.type);
					break;
				default: {
					const _exhaustive: never = op;
					void _exhaustive;
				}
			}
		}
		expect(seen.sort()).toEqual([
			"app",
			"delete-block",
			"format-text",
			"grid",
			"insert-block",
			"move-block",
			"set-meta",
			"set-props",
			"splice-text",
			"stream-open",
		]);

		const result = transformOpsForSuggestModeWithMetadata(
			ops,
			editor,
			"assistant",
			"ai",
		);
		expect(result.operations.length).toBeGreaterThan(0);
		editor.destroy();
	});
});
