import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
	mapOffsetThroughSplices,
	type Assoc,
	type ChangeSummary,
	type TextSplice,
} from "../types/changes";

type AgreementCase = {
	splices: readonly TextSplice[];
	offset: number;
	assoc: Assoc;
	expected: number;
};

type AgreementMeta = {
	seed: number;
	caseCount: number;
	randomized: number;
	edgeCases: number;
	disagreements: number;
	recordedCount: number;
};

function loadJson<T>(name: string): T {
	return JSON.parse(
		readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8"),
	) as T;
}

function changesSource(): string {
	return readFileSync(fileURLToPath(new URL("../types/changes.ts", import.meta.url)), "utf8");
}

describe("mapOffsetThroughSplices", () => {
	it("OB3: agrees with recorded pre-deletion ChangeSummary.mapOffset fixtures", () => {
		const meta = loadJson<AgreementMeta>("mapOffsetThroughSplices.ob3.meta.json");
		const cases = loadJson<AgreementCase[]>("mapOffsetThroughSplices.ob3.json");

		expect(meta.caseCount).toBe(100_015);
		expect(meta.randomized).toBe(100_000);
		expect(meta.disagreements).toBe(0);
		expect(meta.recordedCount).toBeGreaterThan(0);
		expect(cases.length).toBe(meta.recordedCount);

		for (const row of cases) {
			expect(mapOffsetThroughSplices(row.splices, row.offset, row.assoc)).toBe(
				row.expected,
			);
		}
	});

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
