import { describe, it } from "vitest";
import { createTwoPeerHarness } from "@input/pen-test";
import { applySplitBlock, deriveContentMoves } from "../index";

describe("scratch", () => {
	it("prints the remote split summary", () => {
		const harness = createTwoPeerHarness({
			blocks: [{ id: "b1", type: "paragraph", content: "Hello world" }],
		});
		try {
			applySplitBlock(harness.peerB.editor, {
				blockId: "b1",
				offset: 3,
				newBlockId: "b2",
			});
			// eslint-disable-next-line no-console
			console.log(
				"LOCAL(B):",
				JSON.stringify(harness.peerB.editor.lastChangeSummary, null, 1),
			);
			harness.exchange("b-then-a");
			// eslint-disable-next-line no-console
			console.log(
				"REMOTE(A):",
				JSON.stringify(harness.peerA.editor.lastChangeSummary, null, 1),
			);
			// eslint-disable-next-line no-console
			console.log(
				"MOVES(A):",
				JSON.stringify(
					deriveContentMoves(
						harness.peerA.editor.lastChangeSummary!,
						undefined,
					),
				),
			);
			// eslint-disable-next-line no-console
			console.log(
				"TEXT(A):",
				harness.peerA.editor.getBlock("b1")?.textContent(),
				"|",
				harness.peerA.editor.getBlock("b2")?.textContent(),
			);
		} finally {
			harness.destroy();
		}
	});
});
