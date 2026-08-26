import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Assoc, TextSplice } from "@input/pen-types";

import { mapOffsetThroughSplices } from "../changes/mapOffsetThroughSplices";

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
		readFileSync(
			fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)),
			"utf8",
		),
	) as T;
}

describe("mapOffsetThroughSplices", () => {
	it("OB3: agrees with recorded pre-deletion ChangeSummary.mapOffset fixtures", () => {
		const meta = loadJson<AgreementMeta>(
			"mapOffsetThroughSplices.ob3.meta.json",
		);
		const cases = loadJson<AgreementCase[]>(
			"mapOffsetThroughSplices.ob3.json",
		);

		expect(meta.caseCount).toBe(100_015);
		expect(meta.randomized).toBe(100_000);
		expect(meta.disagreements).toBe(0);
		expect(meta.recordedCount).toBeGreaterThan(0);
		expect(cases.length).toBe(meta.recordedCount);

		for (const row of cases) {
			expect(
				mapOffsetThroughSplices(row.splices, row.offset, row.assoc),
			).toBe(row.expected);
		}
	});
});
