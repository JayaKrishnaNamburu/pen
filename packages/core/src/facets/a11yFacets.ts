import { isA11yLabelledBy, type A11yLabel } from "@input/pen-types";

import { defineFacet } from "./defineFacet";

function isUsableA11yLabel(value: A11yLabel | undefined): value is A11yLabel {
	if (typeof value === "string") {
		return value.trim().length > 0;
	}
	if (value == null || !isA11yLabelledBy(value)) {
		return false;
	}
	return value.labelledBy.trim().length > 0;
}

export const a11yLabelFacet = defineFacet<A11yLabel, A11yLabel | undefined>({
	name: "pen.a11yLabel",
	combine: (inputs) => inputs.find(isUsableA11yLabel),
});
