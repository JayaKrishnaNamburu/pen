import { describe, expect, it } from "vitest";
import {
	normalizePlanRecord,
	normalizePlanSteps,
} from "../plan/planSchemas";

describe("@pen/content-ops plan schemas", () => {
	it("normalizes non-record plan payloads to empty objects", () => {
		expect(normalizePlanRecord(null)).toEqual({});
		expect(normalizePlanRecord("plan")).toEqual({});
		expect(normalizePlanRecord(["step"])).toEqual({});
	});

	it("filters malformed plan steps while preserving op-shaped entries", () => {
		const steps = normalizePlanSteps<{ op: string; value?: number }>([
			null,
			{ missing: "op" },
			{ op: 42 },
			{ op: "insert_row", value: 1 },
			{ op: "delete_row" },
		]);

		expect(steps).toEqual([
			{ op: "insert_row", value: 1 },
			{ op: "delete_row" },
		]);
	});
});
