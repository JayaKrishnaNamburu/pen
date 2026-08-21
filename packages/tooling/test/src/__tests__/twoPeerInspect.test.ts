import { beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createTestEditor, resetTestIdCounter } from "../index";
import {
	countMemberships,
	findParentCycle,
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

	it("visibleText returns stored text and strips the empty-block sentinel", () => {
		const editor = createTestEditor({
			blocks: [
				{ id: "p1", type: "paragraph", content: "Hello" },
				{ id: "empty", type: "paragraph" },
			],
		});

		expect(visibleText(editor, "p1")).toBe("Hello");
		expect(visibleText(editor, "empty")).toBe("");
		expect(visibleText("\u200B")).toBe("");

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
		const editor = createTestEditor({
			blocks: [
				{ id: "block-a", type: "callout", content: "A" },
				{ id: "block-b", type: "callout", content: "B" },
			],
		});

		expect(hasParentCycle(editor)).toBe(false);
		expect(findParentCycle(editor)).toBeNull();

		const blocks = editor.ydoc.getMap("blocks");
		const propsA = (blocks.get("block-a") as Y.Map<unknown>).get(
			"props",
		) as Y.Map<unknown>;
		const propsB = (blocks.get("block-b") as Y.Map<unknown>).get(
			"props",
		) as Y.Map<unknown>;
		propsA.set("parentId", "block-b");
		propsB.set("parentId", "block-a");

		expect(hasParentCycle(editor)).toBe(true);
		expect(findParentCycle(editor, "block-a")).toEqual([
			"block-a",
			"block-b",
			"block-a",
		]);

		editor.destroy();
	});
});
