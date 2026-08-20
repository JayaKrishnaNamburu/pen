import { describe, expect, it } from "vitest";

import {
	inputRulesToProviders,
	PEN_INPUT_RULES_FACET_NAME,
} from "../providers";

describe("inputRulesToProviders R-inputRules / 1.3", () => {
	it("maps each Extension.inputRules entry to a pen.inputRules descriptor", () => {
		const rules = [
			{ id: "slash", match: /\/$/, handler: () => [] },
			{ id: "gt", match: />$/, handler: () => [] },
		];

		expect(inputRulesToProviders(rules)).toEqual([
			{
				facetName: PEN_INPUT_RULES_FACET_NAME,
				precedence: "default",
				value: rules[0],
			},
			{
				facetName: PEN_INPUT_RULES_FACET_NAME,
				precedence: "default",
				value: rules[1],
			},
		]);
	});
});
