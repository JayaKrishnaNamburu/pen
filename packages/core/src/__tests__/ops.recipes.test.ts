import type { CommitEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
	deleteBackward,
	deleteForward,
	splitBlock,
} from "../commands";
import { buildMergeBlocksRecipe, buildSplitBlockRecipe } from "../ops/recipes";
import {
	caretOf,
	createCommandEditor,
	liveRegistry,
} from "../commands/__tests__/fixture";

describe("ops recipes GATE 4.6", () => {
	it("pen.splitBlock recipe is insert-block plus two splice-text ops", () => {
		const editor = createCommandEditor([
			{ id: "src", type: "paragraph", text: "hello world" },
		]);
		const recipe = buildSplitBlockRecipe({
			block: editor.getBlock("src")!,
			offset: 5,
			newBlockId: "dest",
		});
		expect(recipe.ops.map((op) => op.type)).toEqual([
			"insert-block",
			"splice-text",
			"splice-text",
		]);
		expect(recipe.ops[0]).toMatchObject({
			type: "insert-block",
			blockId: "dest",
			position: { after: "src" },
		});
		expect(recipe.ops[1]).toMatchObject({
			type: "splice-text",
			blockId: "src",
			from: 5,
			to: 11,
			insert: "",
		});
		expect(recipe.ops[2]).toMatchObject({
			type: "splice-text",
			blockId: "dest",
			from: 0,
			to: 0,
			insert: " world",
		});
		expect(recipe.structural).toEqual({
			kind: "split",
			blockId: "src",
			newBlockId: "dest",
			offset: 5,
		});
		editor.destroy();
	});

	it("merge recipe is splice-text append plus delete-block", () => {
		const editor = createCommandEditor([
			{ id: "target", type: "paragraph", text: "hello" },
			{ id: "source", type: "paragraph", text: " world" },
		]);
		const recipe = buildMergeBlocksRecipe({
			target: editor.getBlock("target")!,
			source: editor.getBlock("source")!,
		});
		expect(recipe.ops.map((op) => op.type)).toEqual([
			"splice-text",
			"delete-block",
		]);
		expect(recipe.ops[0]).toMatchObject({
			type: "splice-text",
			blockId: "target",
			from: 5,
			to: 5,
			insert: " world",
		});
		expect(recipe.ops[1]).toMatchObject({
			type: "delete-block",
			blockId: "source",
		});
		expect(recipe.structural).toEqual({
			kind: "merge",
			targetBlockId: "target",
			sourceBlockId: "source",
		});
		editor.destroy();
	});

	it("pen.splitBlock is one commit, stamps pen.splitBlock, and writes block-split", () => {
		const editor = createCommandEditor([
			{ id: "src", type: "paragraph", text: "hello world" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("src", 5, 5);
		expect(registry.dispatch(splitBlock, undefined)).toBe(true);
		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin.intent).toBe("pen.splitBlock");
		expect(commits[0]!.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "block-split",
				blockId: "src",
				offset: 5,
			}),
		);
		expect(editor.getBlock("src")!.textContent()).toBe("hello");
		expect(caretOf(editor).offset).toBe(0);
		editor.destroy();
	});

	it("pen.deleteBackward merge is one commit, stamps pen.deleteBackward, and writes blocks-merged", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
			{ id: "b", type: "paragraph", text: " world" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("b", 0, 0);
		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin.intent).toBe("pen.deleteBackward");
		expect(commits[0]!.origin.intent).not.toBe("pen.mergeBlocks");
		expect(commits[0]!.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "blocks-merged",
				targetBlockId: "a",
				sourceBlockId: "b",
				joinOffset: 5,
			}),
		);
		expect(editor.getBlock("a")!.textContent()).toBe("hello world");
		expect(editor.getBlock("b")).toBeNull();
		editor.destroy();
	});

	it("pen.deleteForward merge is one commit, stamps pen.deleteForward, and writes blocks-merged", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
			{ id: "b", type: "paragraph", text: " world" },
		]);
		const registry = liveRegistry(editor);
		const commits: CommitEvent[] = [];
		editor.on("commit", (event) => {
			commits.push(event);
		});
		editor.selectText("a", 5, 5);
		expect(
			registry.dispatch(deleteForward, { granularity: "grapheme" }),
		).toBe(true);
		expect(commits).toHaveLength(1);
		expect(commits[0]!.origin.intent).toBe("pen.deleteForward");
		expect(commits[0]!.origin.intent).not.toBe("pen.mergeBlocks");
		expect(commits[0]!.summary.structural).toContainEqual(
			expect.objectContaining({
				type: "blocks-merged",
				targetBlockId: "a",
				sourceBlockId: "b",
				joinOffset: 5,
			}),
		);
		expect(editor.getBlock("a")!.textContent()).toBe("hello world");
		expect(editor.getBlock("b")).toBeNull();
		editor.destroy();
	});
});
