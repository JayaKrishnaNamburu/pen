import { defineExtension, readOnlyFacet } from "@input/pen-core";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createTwoPeerHarness,
	resetTestIdCounter,
	visibleText,
} from "../index";

beforeEach(() => {
	resetTestIdCounter();
});

describe("pen.readOnly vs the multiplayer wire (known split, owner decision pending)", () => {
	it("readOnly facet does not stop the wire (known split, owner decision pending)", () => {
		const harness = createTwoPeerHarness({
			extensions: [
				defineExtension({
					name: "readonly-known-split",
					facets: [readOnlyFacet.of(true)],
				}),
			],
			blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
		});

		try {
			expect(harness.peerA.editor.facet(readOnlyFacet)).toBe(true);
			expect(harness.peerB.editor.facet(readOnlyFacet)).toBe(true);

			harness.peerB.editor.apply(
				[
					{
						type: "insert-text",
						blockId: "p1",
						offset: 5,
						text: " from B",
					},
				],
				{ origin: "user" },
			);
			expect(visibleText(harness.peerB.editor, "p1")).toBe(
				"Hello from B",
			);
			expect(visibleText(harness.peerA.editor, "p1")).toBe("Hello");

			harness.exchange();

			expect(visibleText(harness.peerA.editor, "p1")).toBe(
				"Hello from B",
			);
			expect(visibleText(harness.peerB.editor, "p1")).toBe(
				"Hello from B",
			);
			harness.assertConverged();
		} finally {
			harness.destroy();
		}
	});
});
