import type { Anchor, AnchorTarget, Assoc, EditorAnchors } from "../types/anchors";
import { describe, expect, it } from "vitest";

describe("anchor contracts", () => {
	it("Assoc is the insertion-side pair -1 | 1", () => {
		const left: Assoc = -1;
		const right: Assoc = 1;
		expect(left).toBe(-1);
		expect(right).toBe(1);
	});

	it("AnchorTarget offset is a number in the logical domain", () => {
		const target: AnchorTarget = { blockId: "b1", offset: 0 };
		expect(target.offset).toBe(0);
		const _anchors: EditorAnchors | null = null;
		const _anchor: Anchor | null = null;
		expect(_anchors).toBeNull();
		expect(_anchor).toBeNull();
	});
});
