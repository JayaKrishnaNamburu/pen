import type {
	Editor,
	Facet,
	FacetDependency,
	FacetProvider,
	FacetSpec,
	Precedence,
} from "@input/pen-types";

const DEFAULT_PRECEDENCE: Precedence = "default";

const facetSpecs = new WeakMap<
	Facet<unknown, unknown>,
	FacetSpec<unknown, unknown>
>();
const providerRecords = new WeakMap<FacetProvider, FacetProviderRecord>();

export type FacetProviderRecord =
	| {
			readonly spec: FacetSpec<unknown, unknown>;
			readonly kind: "computed";
			readonly deps: readonly FacetDependency[];
			readonly compute: (editor: Editor) => unknown;
	  }
	| {
			readonly spec: FacetSpec<unknown, unknown>;
			readonly kind: "value";
			readonly deps: readonly FacetDependency[];
			readonly value: unknown;
	  };

export function defineFacet<Input, Output = readonly Input[]>(
	spec: FacetSpec<Input, Output>,
): Facet<Input, Output> {
	const storedSpec = spec as FacetSpec<unknown, unknown>;
	const facet: Facet<Input, Output> = {
		name: spec.name,
		of(value, precedence = DEFAULT_PRECEDENCE) {
			const provider: FacetProvider = {
				facetName: spec.name,
				precedence,
			};
			providerRecords.set(provider, {
				spec: storedSpec,
				kind: "value",
				deps: [],
				value,
			});
			return provider;
		},
		compute(deps, fn, precedence = DEFAULT_PRECEDENCE) {
			const provider: FacetProvider = {
				facetName: spec.name,
				precedence,
			};
			providerRecords.set(provider, {
				spec: storedSpec,
				kind: "computed",
				deps,
				compute: fn as (editor: Editor) => unknown,
			});
			return provider;
		},
	};
	facetSpecs.set(facet as Facet<unknown, unknown>, storedSpec);
	return facet;
}

export function getFacetSpec<Input, Output>(
	facet: Facet<Input, Output>,
): FacetSpec<Input, Output> {
	const spec = facetSpecs.get(facet as Facet<unknown, unknown>);
	if (!spec) {
		throw new Error(`Unknown facet "${facet.name}"`);
	}
	return spec as FacetSpec<Input, Output>;
}

export function getProviderRecord(provider: FacetProvider): FacetProviderRecord {
	const record = providerRecords.get(provider);
	if (!record) {
		throw new Error(`Unknown provider for facet "${provider.facetName}"`);
	}
	return record;
}
