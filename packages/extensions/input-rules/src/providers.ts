import type { FacetProvider, InputRule } from "@input/pen-types";

export const PEN_INPUT_RULES_FACET_NAME = "pen.inputRules" as const;

export interface InputRuleFacetProvider extends FacetProvider {
	readonly facetName: typeof PEN_INPUT_RULES_FACET_NAME;
	readonly precedence: "default";
	readonly value: InputRule;
}

export function inputRulesToProviders(
	rules: readonly InputRule[],
): readonly InputRuleFacetProvider[] {
	return rules.map((rule) => ({
		facetName: PEN_INPUT_RULES_FACET_NAME,
		precedence: "default",
		value: rule,
	}));
}
