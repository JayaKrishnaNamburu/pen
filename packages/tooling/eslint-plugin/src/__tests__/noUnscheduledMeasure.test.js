import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noUnscheduledMeasure } from "../rules/noUnscheduledMeasure.js";

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

const file = "packages/rendering/dom/src/seeded-measure.ts";

describe("no-unscheduled-measure (SCH1)", () => {
	it("SCH1: flags geometry reads and consumes a matching allowlist symbol", () => {
		ruleTester.run("no-unscheduled-measure", noUnscheduledMeasure, {
			valid: [
				{
					code: "function measureNow() { el.getBoundingClientRect(); return el.getBoundingClientRect(); }\n",
					filename: file,
					options: [
						{
							allowlist: [
								{
									file,
									symbol: "measureNow",
									reason: "GeometryReader G1",
								},
							],
						},
					],
				},
				{
					code: "function read() { return range.getClientRects; }\n",
					filename: file,
					options: [
						{
							allowlist: [
								{
									file,
									symbol: "read",
									reason: "type mention inside GeometryReader",
								},
							],
						},
					],
				},
			],
			invalid: [
				{
					code: "function overlayPaint() { return el.getBoundingClientRect(); }\n",
					filename: file,
					options: [{ allowlist: [] }],
					errors: [
						{
							messageId: "measure",
							data: {
								kind: "getBoundingClientRect",
								symbol: "overlayPaint",
								file,
							},
						},
					],
				},
				{
					code: "function overlayPaint() { return 1; }\n",
					filename: file,
					options: [
						{
							allowlist: [
								{
									file,
									symbol: "overlayPaint",
									reason: "retired",
								},
							],
						},
					],
					errors: [{ messageId: "unusedAllowlist" }],
				},
			],
		});
	});
});
