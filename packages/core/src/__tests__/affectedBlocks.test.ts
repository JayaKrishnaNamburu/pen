import { describe, expect, it } from "vitest";

import { affectedBlockIdsFromSummary } from "../changes/affectedBlocks";
import { createEmptySummary } from "../changes/mapping";
import type { ChangeSummary, StructuralChange } from "../changes/types";

function summaryWith(
	structural: readonly StructuralChange[],
	blockIds: readonly string[] = [],
): ChangeSummary {
	const blockText = blockIds.map((blockId) => ({
		blockId,
		splices: [{ from: 0, to: 0, insertLength: 1 }],
		formatRanges: [],
	}));
	const base = createEmptySummary(1);
	return {
		...base,
		blockText,
		structural,
		affectedBlockIds: affectedBlockIdsFromSummary({ blockText, structural }),
	};
}

describe("affectedBlockIdsFromSummary", () => {
	it("collects text and structural block ids", () => {
		expect(
			affectedBlockIdsFromSummary(
				summaryWith(
					[
						{
							type: "block-inserted",
							blockId: "b2",
							parentId: null,
							index: 1,
						},
						{
							type: "block-split",
							blockId: "b3",
							newBlockId: "b4",
							offset: 2,
						},
						{
							type: "blocks-merged",
							targetBlockId: "b5",
							sourceBlockId: "b6",
							joinOffset: 3,
						},
						{ type: "apps-changed", appIds: ["app-1"] },
						{ type: "metadata-changed", namespaces: ["pen"] },
					],
					["b1"],
				),
			),
		).toEqual(["b1", "b2", "b3", "b4", "b5", "b6"]);
	});
});
