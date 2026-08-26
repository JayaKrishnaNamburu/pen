// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { SchemaRegistry } from "@input/pen-types";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import { resolveNextInlineAtomTargets } from "../primitives/editor/inlineAtomTargets";

const registry = {
	resolveInline: () => ({
		serialize: {
			toMarkdown: () => "@Ada",
		},
	}),
} as unknown as Pick<SchemaRegistry, "resolveInline">;

function mountAtomRoot(count: number): HTMLElement {
	const root = document.createElement("div");
	for (let index = 0; index < count; index += 1) {
		const atom = document.createElement("span");
		atom.setAttribute(DATA_ATTRS.inlineAtom, "");
		root.append(atom);
	}
	return root;
}

describe("inline atom render targets", () => {
	it("SCALE2 I8: unchanged atom deltas keep the previous target list by identity", () => {
		const root = mountAtomRoot(1);
		const deltas = [
			{
				insert: {
					type: "mention",
					props: { id: "1", label: "Ada" },
				},
			},
		];

		const first = resolveNextInlineAtomTargets(
			root,
			undefined,
			registry,
			deltas,
			[],
		);
		const second = resolveNextInlineAtomTargets(
			root,
			undefined,
			registry,
			deltas,
			first,
		);

		expect(first).toHaveLength(1);
		expect(second).toBe(first);
	});

	it("SCALE2: reordered keys and a dropped undefined member do not allocate a new target list", () => {
		const root = mountAtomRoot(1);
		const previous = resolveNextInlineAtomTargets(
			root,
			undefined,
			registry,
			[
				{
					insert: {
						type: "mention",
						props: { id: "1", label: "Ada" },
					},
				},
			],
			[],
		);
		const reordered = resolveNextInlineAtomTargets(
			root,
			undefined,
			registry,
			[
				{
					insert: {
						type: "mention",
						props: { label: "Ada", id: "1", extra: undefined },
					},
				},
			],
			previous,
		);

		expect(
			JSON.stringify({ id: "1", label: "Ada" }) ===
				JSON.stringify({ label: "Ada", id: "1" }),
		).toBe(false);
		expect(reordered).toBe(previous);
	});
});
