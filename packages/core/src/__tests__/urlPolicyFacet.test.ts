import { describe, expect, it } from "vitest";

import { getFacetSpec } from "../facets/defineFacet";
import { urlPolicyFacet, type UrlPolicy } from "../facets/urlPolicyFacet";
import { createFacetRegistry } from "../index";

function policy(id: string): UrlPolicy {
	return {
		resolve: () => id,
	};
}

describe("SEC1 / S.1-facet pen.urlPolicy", () => {
	it("SEC1 / S.1-facet: names the facet pen.urlPolicy", () => {
		expect(urlPolicyFacet.name).toBe("pen.urlPolicy");
	});

	it("SEC1 / S.1-facet: last provider wins", () => {
		const spec = getFacetSpec(urlPolicyFacet);
		const first = policy("first");
		const last = policy("last");

		expect(spec.combine([first, last])).toBe(last);

		const registry = createFacetRegistry({
			providers: [urlPolicyFacet.of(first), urlPolicyFacet.of(last)],
		});
		registry.markReady();
		expect(registry.read(urlPolicyFacet)).toBe(last);
	});

	it("SEC1 / S.1-facet: empty combine is undefined (core cannot import pen-dom)", () => {
		// wrapping urlPolicy.resolve here would add a core→dom dependency; host/dom binding lands later
		const spec = getFacetSpec(urlPolicyFacet);
		expect(spec.combine([])).toBeUndefined();

		const registry = createFacetRegistry();
		registry.markReady();
		expect(registry.read(urlPolicyFacet)).toBeUndefined();
	});
});
