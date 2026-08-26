import type { Editor, Extension, FacetProvider } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createFacetRegistry, defineFacet } from "../facets/registry";
import { getFacetSpec, getProviderRecord } from "../facets/defineFacet";

function extension(
	name: string,
	facets: FacetProvider[],
	dependencies?: string[],
): Extension {
	return { name, version: "0.0.0", facets, dependencies };
}

function orderedStrings() {
	return defineFacet<string, readonly string[]>({
		name: "test.order",
		combine: (inputs) => inputs,
	});
}

describe("facet registry", () => {
	it("R1: providers combine in precedence, then extension order, then array index", () => {
		const facet = orderedStrings();
		const registry = createFacetRegistry({
			providers: [facet.of("core-default")],
			extensions: [
				extension(
					"top",
					[facet.of("top-high", "high"), facet.of("top-default")],
					["mid"],
				),
				extension("base", [
					facet.of("base-high-0", "high"),
					facet.of("base-high-1", "high"),
					facet.of("base-default"),
					facet.of("base-lowest", "lowest"),
				]),
				extension(
					"mid",
					[
						facet.of("mid-highest", "highest"),
						facet.of("mid-low", "low"),
					],
					["base"],
				),
			],
		});
		registry.markReady();

		expect(registry.read(facet)).toEqual([
			"mid-highest",
			"base-high-0",
			"base-high-1",
			"top-high",
			"core-default",
			"base-default",
			"top-default",
			"mid-low",
			"base-lowest",
		]);
	});

	it("R2: computed provider on a static facet throws at creation", () => {
		const frozen = defineFacet<number, number | null>({
			name: "test.static",
			static: true,
			combine: (inputs) => inputs[0] ?? null,
		});

		expect(() =>
			createFacetRegistry({
				providers: [frozen.compute([], () => 1)],
			}),
		).toThrow(
			'Computed provider registered for static facet "test.static"',
		);
	});

	it("R5: computed facet dependency cycle throws at creation", () => {
		const left = defineFacet<number, number>({
			name: "test.cycle-left",
			combine: (inputs) => inputs[0] ?? 0,
		});
		const right = defineFacet<number, number>({
			name: "test.cycle-right",
			combine: (inputs) => inputs[0] ?? 0,
		});

		expect(() =>
			createFacetRegistry({
				providers: [
					left.compute([right], () => 1),
					right.compute([left], () => 2),
				],
			}),
		).toThrow(/Facet dependency cycle/);
	});

	it("R6: compute functions receive the editor for pure reads", () => {
		const seen: Editor[] = [];
		const editor = { clientId: 7 } as Editor;
		const facet = defineFacet<number, number>({
			name: "test.reads",
			combine: (inputs) => inputs[0] ?? 0,
		});
		const registry = createFacetRegistry({
			editor,
			providers: [
				facet.compute([], (current) => {
					seen.push(current);
					return current.clientId;
				}),
			],
		});
		registry.markReady();

		expect(seen).toEqual([editor]);
		expect(registry.read(facet)).toBe(7);
	});

	it("R7: facet reads before ready throw", () => {
		const facet = orderedStrings();
		const registry = createFacetRegistry({
			providers: [facet.of("ready")],
		});

		expect(() => registry.read(facet)).toThrow(
			"Facet read before registry is ready",
		);
		expect(() => registry.settle({ commitId: 1 })).toThrow(
			"Facet settle before registry is ready",
		);

		registry.markReady();
		expect(registry.read(facet)).toEqual(["ready"]);
	});

	it("R7: unregistered facet read returns combine([]) and is identity-stable", () => {
		const facet = orderedStrings();
		const empty = getFacetSpec(facet).combine([]);
		const registry = createFacetRegistry();
		registry.markReady();

		const first = registry.read(facet);
		expect(first).toEqual([]);
		expect(first).not.toBe(empty);
		expect(registry.read(facet)).toBe(first);
	});

	it("getProviderRecord distinguishes value and computed providers", () => {
		const facet = defineFacet<string, string>({
			name: "test.record",
			combine: (inputs) => inputs[0] ?? "",
		});
		const value = facet.of("held");
		const computed = facet.compute(["document"], () => "next");

		expect(getProviderRecord(value)).toMatchObject({
			kind: "value",
			value: "held",
			deps: [],
		});
		expect(getProviderRecord(computed).kind).toBe("computed");
		expect(getProviderRecord(computed).deps).toEqual(["document"]);
	});
});
