import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { ChangeSummary } from "../types/changes";

function changesSource(): string {
	return readFileSync(fileURLToPath(new URL("../types/changes.ts", import.meta.url)), "utf8");
}

describe("change-summary contracts", () => {
	it("OB4: summaries stay content-free — lengths, offsets, IDs, and keys only", () => {
		const source = changesSource();
		const spliceBlock = source.match(/export interface TextSplice \{[\s\S]*?\}/)?.[0];
		expect(spliceBlock, "TextSplice must stay declared").toBeDefined();
		expect(spliceBlock).toContain("insertLength");
		expect(spliceBlock).not.toMatch(/\binsert\s*:/);
		expect(spliceBlock).not.toMatch(/\bcontent\s*:/);
		expect(spliceBlock).not.toMatch(/\bvalue\s*:/);

		const secret = "NEVER_COPY_THIS_TEXT";
		const summary = {
			commitId: 1,
			blockText: [
				{
					blockId: "b1",
					splices: [{ from: 0, to: 0, insertLength: secret.length }],
					formatRanges: [],
				},
			],
			structural: [],
			affectedBlockIds: ["b1"],
		} satisfies ChangeSummary;
		expect(JSON.stringify(summary)).not.toContain(secret);
		expect(summary.blockText[0]!.splices[0]).toEqual({
			from: 0,
			to: 0,
			insertLength: secret.length,
		});
	});
});
