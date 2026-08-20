import { defineBlock } from "@input/pen-types";
import * as penTypes from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { attachA11y, withA11y } from "../schema/a11y";

function callLabel<Props>(
	label: string | ((props: Props) => string),
	props: Props,
): string {
	if (typeof label !== "function") {
		throw new Error("expected a11y.label to be a function");
	}
	return label(props);
}

describe("block a11y (AX4 / X.1)", () => {
	it("AX4 / X.1: attachA11y returns a schema copy with a frozen a11y spec", () => {
		const schema = defineBlock("image", { content: "none" });
		const spec = {
			label: (props: { alt: string }) => props.alt || "Image",
			roleDescription: "image",
		};

		const withSpec = attachA11y(schema, spec);

		expect(withSpec).not.toBe(schema);
		expect(withSpec.type).toBe("image");
		expect(withSpec.content).toBe("none");
		expect(callLabel(withSpec.a11y.label, { alt: "Cat" })).toBe("Cat");
		expect(withSpec.a11y.roleDescription).toBe("image");
		expect(Object.isFrozen(withSpec.a11y)).toBe(true);
		expect(() => {
			(withSpec.a11y as { roleDescription?: string }).roleDescription =
				"graphic";
		}).toThrow(TypeError);
		expect(schema).not.toHaveProperty("a11y");
	});

	it("AX4 / X.1: withA11y is the same helper and leaves roleDescription optional", () => {
		const schema = defineBlock("mention", {
			content: "none",
			props: { name: { type: "string", default: "" } },
		});

		const withSpec = withA11y(schema, {
			label: (props: { name: string }) => props.name || "mention",
		});

		expect(callLabel(withSpec.a11y.label, { name: "Ada" })).toBe("Ada");
		expect(withSpec.a11y.roleDescription).toBeUndefined();
		expect(Object.isFrozen(withSpec.a11y)).toBe(true);
		expect(Object.keys(withSpec.a11y)).toEqual(["label"]);
	});

	it("AX4 / X.1: mutating the caller spec after attach does not change the frozen copy", () => {
		const schema = defineBlock("emoji", { content: "none" });
		const spec: {
			label: (props: { glyph: string }) => string;
			roleDescription?: string;
		} = {
			label: (props) => props.glyph,
			roleDescription: "emoji",
		};

		const withSpec = attachA11y(schema, spec);
		spec.roleDescription = "changed";

		expect(withSpec.a11y.roleDescription).toBe("emoji");
	});

	it("AX4 / X.1: withA11y is attachA11y and types does not export either (API3)", () => {
		expect(typeof attachA11y).toBe("function");
		expect(withA11y).toBe(attachA11y);
		expect("attachA11y" in penTypes).toBe(false);
		expect("withA11y" in penTypes).toBe(false);
	});

	it("AX4 / X.1: frozen a11y is a new object and drops unknown spec keys", () => {
		const schema = defineBlock("mention", { content: "none" });
		const spec = {
			label: () => "Ada",
			roleDescription: "mention",
			extra: "not-in-contract",
		};

		const withSpec = attachA11y(schema, spec);

		expect(withSpec.a11y).not.toBe(spec);
		expect("extra" in withSpec.a11y).toBe(false);
		expect(Object.keys(withSpec.a11y)).toEqual(["label", "roleDescription"]);
		expect(Object.isFrozen(spec)).toBe(false);
	});

	it("AX4 / X.1: empty roleDescription is kept; omitted stays absent", () => {
		const schema = defineBlock("hr", { content: "none" });

		const withEmpty = attachA11y(schema, {
			label: () => "Divider",
			roleDescription: "",
		});
		const without = attachA11y(schema, {
			label: () => "Divider",
		});

		expect(withEmpty.a11y.roleDescription).toBe("");
		expect(Object.keys(withEmpty.a11y)).toEqual(["label", "roleDescription"]);
		expect(without.a11y.roleDescription).toBeUndefined();
		expect(Object.keys(without.a11y)).toEqual(["label"]);
	});

	it("AX4 / X.1: attachA11y copies a plain schema object and does not freeze it", () => {
		const schema = { type: "embed", content: "none" as const };

		const withSpec = attachA11y(schema, {
			label: (props: { title: string }) => props.title || "embed",
			roleDescription: "widget",
		});

		expect(withSpec).not.toBe(schema);
		expect(withSpec.type).toBe("embed");
		expect(Object.isFrozen(withSpec)).toBe(false);
		expect(callLabel(withSpec.a11y.label, { title: "Map" })).toBe("Map");
		expect(schema).not.toHaveProperty("a11y");
	});

	it("AX4 / X.1: attachA11y replaces a prior a11y spec without mutating it", () => {
		const schema = defineBlock("image", { content: "none" });
		const first = attachA11y(schema, {
			label: (_props: Record<string, never>) => "old",
			roleDescription: "image",
		});

		const second = attachA11y(first, {
			label: (props: { alt: string }) => props.alt || "image",
		});

		expect(second).not.toBe(first);
		expect(second.a11y).not.toBe(first.a11y);
		expect(callLabel(second.a11y.label, { alt: "Cat" })).toBe("Cat");
		expect(second.a11y.roleDescription).toBeUndefined();
		expect(callLabel(first.a11y.label, {})).toBe("old");
		expect(first.a11y.roleDescription).toBe("image");
	});

	it("AX4 / X.1: replacing spec.label after attach keeps the attached function", () => {
		const schema = defineBlock("emoji", { content: "none" });
		const spec = {
			label: (props: { glyph: string }) => props.glyph || "emoji",
		};
		const attachedLabel = spec.label;

		const withSpec = attachA11y(schema, spec);
		spec.label = () => "changed";

		expect(withSpec.a11y.label).toBe(attachedLabel);
		expect(callLabel(withSpec.a11y.label, { glyph: "✓" })).toBe("✓");
		expect(callLabel(withSpec.a11y.label, { glyph: "" })).toBe("emoji");
	});
});
