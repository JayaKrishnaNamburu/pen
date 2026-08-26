import { describe, expect, it } from "vitest";
import type { InlineSchema, SchemaRegistry } from "@input/pen-types";
import { sortDeltaAttributes } from "../schema/normalize";

function registryWith(
	marks: Record<string, Pick<InlineSchema, "priority" | "system">>,
): SchemaRegistry {
	return {
		resolveInline(name: string) {
			return marks[name] as InlineSchema | undefined;
		},
	} as SchemaRegistry;
}

describe("sortDeltaAttributes", () => {
	it("orders marks by schema priority", () => {
		const sorted = sortDeltaAttributes(
			{ italic: true, bold: true },
			registryWith({
				bold: { priority: 1 },
				italic: { priority: 2 },
			}),
		);

		expect(Object.keys(sorted)).toEqual(["bold", "italic"]);
	});

	it("returns the same object when there are fewer than two marks", () => {
		const attrs = { bold: true };
		expect(sortDeltaAttributes(attrs, registryWith({}))).toBe(attrs);
	});
});
