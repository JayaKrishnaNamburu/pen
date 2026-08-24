import { defineExtension, ariaReadOnlyFacet } from "@input/pen-core";
import { beforeEach, describe, expect, it } from "vitest";
import {
	createTwoPeerHarness,
	resetTestIdCounter,
	visibleText,
} from "../index";

beforeEach(() => {
	resetTestIdCounter();
});

describe("pen.ariaReadOnly vs the multiplayer wire", () => {
	it("ariaReadOnly facet does not stop the wire", () => {
		const harness = createTwoPeerHarness({
			extensions: [
				defineExtension({
					name: "aria-readonly-split",
					facets: [ariaReadOnlyFacet.of(true)],
				}),
			],
			blocks: [{ id: "p1", type: "paragraph", content: "Hello" }],
		});

		try {
			expect(harness.peerA.editor.facet(ariaReadOnlyFacet)).toBe(true);
			expect(harness.peerB.editor.facet(ariaReadOnlyFacet)).toBe(true);

			harness.peerB.editor.apply(
				[
					{
						type: "splice-text",
						blockId: "p1",
						from: 5,
				to: 5,
				insert: " from B",
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
