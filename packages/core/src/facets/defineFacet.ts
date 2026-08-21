import type {
	Editor,
	Facet,
	FacetDependency,
	FacetProvider,
	FacetSpec,
	Precedence,
} from "@input/pen-types";

const DEFAULT_PRECEDENCE: Precedence = "default";

const PROCESS_STATE_KEY = Symbol.for("@input/pen-core:facetState");

type FacetProcessState = {
	readonly providerRecords: WeakMap<FacetProvider, FacetProviderRecord>;
	readonly facetSpecs: WeakMap<
		Facet<unknown, unknown>,
		FacetSpec<unknown, unknown>
	>;
	readonly specsByName: Map<string, FacetSpec<unknown, unknown>>;
};

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

function facetProcessState(): FacetProcessState {
	const holder = globalThis as typeof globalThis & {
		[PROCESS_STATE_KEY]?: FacetProcessState;
	};
	if (!holder[PROCESS_STATE_KEY]) {
		holder[PROCESS_STATE_KEY] = {
			providerRecords: new WeakMap(),
			facetSpecs: new WeakMap(),
			specsByName: new Map(),
		};
	}
	return holder[PROCESS_STATE_KEY];
}

function isStaticSpec(spec: FacetSpec<unknown, unknown>): boolean {
	return spec.static === true;
}

export function assertCompatibleFacetSpec(
	name: string,
	existing: FacetSpec<unknown, unknown>,
	incoming: FacetSpec<unknown, unknown>,
): void {
	if (isStaticSpec(existing) === isStaticSpec(incoming)) return;
	throw new Error(
		`Facet "${name}" is already defined with static=${isStaticSpec(existing)}; a second definition has static=${isStaticSpec(incoming)}. Two facet definitions cannot share a name unless they agree on static.`,
	);
}

function registerSpec(spec: FacetSpec<unknown, unknown>): void {
	const { specsByName } = facetProcessState();
	const existing = specsByName.get(spec.name);
	if (existing) {
		assertCompatibleFacetSpec(spec.name, existing, spec);
		return;
	}
	specsByName.set(spec.name, spec);
}

function canonicalSpec(
	name: string,
	incoming: FacetSpec<unknown, unknown>,
): FacetSpec<unknown, unknown> {
	const named = facetProcessState().specsByName.get(name);
	if (!named) return incoming;
	assertCompatibleFacetSpec(name, named, incoming);
	return named;
}

function unknownCopyMessage(kind: "provider" | "facet", name: string): string {
	const head =
		kind === "provider"
			? `Unknown provider for facet "${name}". The provider`
			: `Unknown facet "${name}". The facet object`;
	return `${head} was not created by defineFacet in this process. This usually means two copies of @input/pen-core are loaded; WeakMap lookup then misses across module copies. Deduplicate @input/pen-core (package manager resolutions / bundler alias) so the editor and extensions share one defineFacet module.`;
}

export function defineFacet<Input, Output = readonly Input[]>(
	spec: FacetSpec<Input, Output>,
): Facet<Input, Output> {
	const storedSpec = spec as FacetSpec<unknown, unknown>;
	registerSpec(storedSpec);
	const { providerRecords, facetSpecs } = facetProcessState();
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
	const { facetSpecs, specsByName } = facetProcessState();
	const spec =
		facetSpecs.get(facet as Facet<unknown, unknown>) ??
		specsByName.get(facet.name);
	if (!spec) {
		throw new Error(unknownCopyMessage("facet", facet.name));
	}
	return spec as FacetSpec<Input, Output>;
}

export function getProviderRecord(provider: FacetProvider): FacetProviderRecord {
	const record = facetProcessState().providerRecords.get(provider);
	if (!record) {
		throw new Error(unknownCopyMessage("provider", provider.facetName));
	}
	const spec = canonicalSpec(provider.facetName, record.spec);
	if (spec === record.spec) return record;
	return { ...record, spec };
}
