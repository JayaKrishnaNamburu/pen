import type { Editor } from "./editor";

export type Precedence = "highest" | "high" | "default" | "low" | "lowest";

export interface FacetSpec<Input, Output> {
	readonly name: string;
	combine(inputs: readonly Input[]): Output;
	compareOutput?(a: Output, b: Output): boolean;
	compareInput?(a: Input, b: Input): boolean;
	readonly static?: boolean;
}

export interface Facet<Input, Output = readonly Input[]> {
	readonly name: string;
	of(value: Input, precedence?: Precedence): FacetProvider;
	compute(
		deps: readonly FacetDependency[],
		fn: (editor: Editor) => Input,
		precedence?: Precedence,
	): FacetProvider;
}

export type FacetDependency = Facet<unknown, unknown> | "document" | "selection";

export interface FacetProvider {
	readonly facetName: string;
	readonly precedence: Precedence;
}

export type FacetOutput<F> = F extends Facet<infer _Input, infer Output>
	? Output
	: never;

export type DefineFacet = <Input, Output = readonly Input[]>(
	spec: FacetSpec<Input, Output>,
) => Facet<Input, Output>;
