import { describe, expect, it } from "vitest";

import {
	defineFacet,
	getFacetSpec,
	getProviderRecord,
} from "../facets/defineFacet";
// Vite treats a different query as a second evaluation — two WeakMaps,
// same as a host that failed to dedupe @input/pen-core or a source-vs-dist
// test import. A same-name second object in one module does not reproduce
// this; .of() and getProviderRecord already share that module's map.
// Guards the facet registry against a duplicated @input/pen-core, the same
// dedupe hazard the yjs two-copies rule tracks.
// @ts-expect-error API1 two-copies: a query import is a second module copy, not a resolvable path
import * as facetCopy from "../facets/defineFacet?copy=duplicate";
import { createFacetRegistry } from "../facets/registry";

const defineFacetCopy: typeof defineFacet = facetCopy.defineFacet;
const getFacetSpecCopy: typeof getFacetSpec = facetCopy.getFacetSpec;

describe("facet registry across module copies", () => {
	it("resolves a provider created by a second defineFacet evaluation of the same name", () => {
		const local = defineFacet<string, readonly string[]>({
			name: "test.duplicate-copy",
			combine: (inputs) => inputs,
		});
		const foreign = defineFacetCopy<string, readonly string[]>({
			name: "test.duplicate-copy",
			combine: (inputs) => inputs,
		});

		expect(local).not.toBe(foreign);
		expect(getFacetSpec(local)).not.toBe(getFacetSpecCopy(foreign));
		expect(
			getFacetSpec({ name: "test.duplicate-copy" } as typeof local),
		).toBe(getFacetSpec(local));

		const provider = foreign.of("from-copy");
		expect(getProviderRecord(provider)).toMatchObject({
			kind: "value",
			value: "from-copy",
		});

		const registry = createFacetRegistry({
			providers: [provider],
		});
		registry.markReady();
		expect(registry.read(local)).toEqual(["from-copy"]);
	});

	it("names the duplicate-copy case when a provider was never registered", () => {
		expect(() =>
			getProviderRecord({
				facetName: "test.missing-provider",
				precedence: "default",
			}),
		).toThrow(/two copies of @input\/pen-core/i);
	});

	it("throws when a second definition of the same name disagrees on static", () => {
		defineFacet<number, number | null>({
			name: "test.static-collision",
			static: true,
			combine: (inputs) => inputs[0] ?? null,
		});

		expect(() =>
			defineFacetCopy<number, number>({
				name: "test.static-collision",
				combine: (inputs) => inputs[0] ?? 0,
			}),
		).toThrow(/test\.static-collision/);
	});
});
