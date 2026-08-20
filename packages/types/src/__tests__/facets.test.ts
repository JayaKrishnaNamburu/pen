import { describe, expect, it } from "vitest";
import type {
	DefineFacet,
	Facet,
	FacetDependency,
	FacetOutput,
	FacetProvider,
	FacetSpec,
	Precedence,
} from "../types/facets";
import * as facets from "../types/facets";

type _Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _Precedence = _Assert<
	Equal<Precedence, "highest" | "high" | "default" | "low" | "lowest">
>;
type _DefaultOutput = _Assert<
	Equal<FacetOutput<Facet<string>>, readonly string[]>
>;
type _CustomOutput = _Assert<
	Equal<FacetOutput<Facet<boolean, boolean>>, boolean>
>;
type _DefineFacetResult = _Assert<
	Equal<ReturnType<DefineFacet>, Facet<unknown, unknown>>
>;

describe("facet contracts", () => {
	it("API3: facets.ts is types-only (no runtime exports)", () => {
		expect(Object.keys(facets)).toEqual([]);
	});

	it("spec: Precedence buckets and FacetProvider fields are assignable", () => {
		const precedence: readonly Precedence[] = [
			"highest",
			"high",
			"default",
			"low",
			"lowest",
		];
		const spec: FacetSpec<string, string> = {
			name: "test.facet",
			combine: (inputs) => inputs[0] ?? "",
		};
		const provider: FacetProvider = {
			facetName: spec.name,
			precedence: "default",
		};
		const deps: readonly FacetDependency[] = ["document", "selection"];

		expect(precedence).toHaveLength(5);
		expect(spec.name).toBe("test.facet");
		expect(provider.precedence).toBe("default");
		expect(deps).toEqual(["document", "selection"]);
	});
});
