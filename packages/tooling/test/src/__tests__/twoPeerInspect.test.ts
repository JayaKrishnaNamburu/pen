import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createTestDocument, createTestEditor, resetTestIdCounter } from "../index";
import {
	collectInlineText,
	concatenatedInlineText,
	countEmptyInlineBlocks,
	countMemberships,
	findParentCycle,
	getChildrenIds,
	getParentId,
	hasParentCycle,
	listBlockIds,
	parentsOf,
	visibleText,
} from "../twoPeerInspect";

beforeEach(() => {
	resetTestIdCounter();
});

describe("two-peer inspect helpers", () => {
	it("listBlockIds and countMemberships see every stored block", () => {
		const editor = createTestEditor({
			blocks: [
				{ id: "p1", type: "paragraph", content: "Hello" },
				{ id: "p2", type: "paragraph", content: "World" },
			],
		});

		expect(listBlockIds(editor)).toEqual(["p1", "p2"]);
		expect(countMemberships(editor, "p1")).toBe(1);
		expect(countMemberships(editor, "ghost")).toBe(0);

		editor.destroy();
	});

	it("visibleText returns stored text and treats an empty block as empty", () => {
		const editor = createTestEditor({
			blocks: [
				{ id: "p1", type: "paragraph", content: "Hello" },
				{ id: "empty", type: "paragraph" },
			],
		});

		expect(visibleText(editor, "p1")).toBe("Hello");
		expect(visibleText(editor, "empty")).toBe("");
		expect(visibleText("")).toBe("");

		editor.destroy();
	});

	it("getParentId and parentsOf read parentId", () => {
		const editor = createTestEditor({
			blocks: [
				{ id: "parent", type: "toggle", content: "Parent" },
				{ id: "child", type: "paragraph", content: "Child" },
			],
		});
		const props = (
			editor.ydoc.getMap("blocks").get("child") as Y.Map<unknown>
		).get("props") as Y.Map<unknown>;
		props.set("parentId", "parent");

		expect(getParentId(editor, "child")).toBe("parent");
		expect(parentsOf(editor, "child")).toEqual(["parent"]);
		expect(getParentId(editor, "parent")).toBeNull();

		editor.destroy();
	});

	it("findParentCycle reports a cycle and stays quiet when there is none", () => {
		const { ydoc, doc } = createTestDocument([
			{ id: "block-a", type: "callout", content: "A" },
			{ id: "block-b", type: "callout", content: "B" },
		]);

		expect(hasParentCycle(doc)).toBe(false);
		expect(findParentCycle(doc)).toBeNull();

		const blocks = ydoc.getMap("blocks");
		const propsA = (blocks.get("block-a") as Y.Map<unknown>).get(
			"props",
		) as Y.Map<unknown>;
		const propsB = (blocks.get("block-b") as Y.Map<unknown>).get(
			"props",
		) as Y.Map<unknown>;
		propsA.set("parentId", "block-b");
		propsB.set("parentId", "block-a");

		expect(hasParentCycle(doc)).toBe(true);
		expect(findParentCycle(doc, "block-a")).toEqual([
			"block-a",
			"block-b",
			"block-a",
		]);
	});

	it("getChildrenIds reads stored children, not a parentId-only view", () => {
		const editor = createTestEditor({
			blocks: [
				{
					id: "parent",
					type: "layoutRow",
					children: [
						{ id: "child-a", type: "paragraph", content: "A" },
						{ id: "child-b", type: "paragraph", content: "B" },
					],
				},
			],
		});

		expect(getChildrenIds(editor, "parent")).toEqual(["child-a", "child-b"]);
		expect(getChildrenIds(editor, "child-a")).toEqual([]);

		editor.destroy();
	});

	it("countEmptyInlineBlocks is 1 for a sentinel-only paragraph, not 0", () => {
		const editor = createTestEditor({
			blocks: [
				{ id: "p1", type: "paragraph", content: "Hello" },
				{ id: "empty", type: "paragraph" },
			],
		});

		expect(countEmptyInlineBlocks(editor)).toBe(1);

		editor.destroy();
	});

	it("collectInlineText and concatenatedInlineText see every inline block", () => {
		const editor = createTestEditor({
			blocks: [
				{ id: "p1", type: "paragraph", content: "Hello" },
				{ id: "p2", type: "paragraph", content: "World" },
			],
		});

		expect(collectInlineText(editor)).toEqual(["Hello", "World"]);
		expect(concatenatedInlineText(editor)).toBe("HelloWorld");

		editor.destroy();
	});
});
