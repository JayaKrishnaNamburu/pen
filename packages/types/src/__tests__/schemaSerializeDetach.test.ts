import { describe, expect, it } from "vitest";
import type { Block } from "../types/block";
import type { BlockSchema } from "../types/schema";

function hostMayDetach(schema: BlockSchema): void {
	const toHTML = schema.serialize.toHTML;
	const toMarkdown = schema.serialize.toMarkdown;
	const normalize = schema.normalize;
	const validateProps = schema.validateProps;

	const block: Block = { id: "b1", type: schema.type, props: {} };
	toHTML?.(block);
	toMarkdown?.(block);
	normalize?.(block);
	validateProps?.({});

	schema.serialize.toHTML?.bind(undefined);
	schema.normalize?.bind(undefined);
	schema.validateProps?.bind(undefined);
}

describe("BlockSchema this: void serializers", () => {
	it("allows detaching serialize/normalize/validateProps", () => {
		const schema: BlockSchema = {
			type: "paragraph",
			propSchema: {},
			content: "inline",
			serialize: {
				toHTML: (block: Block) => `<p>${block.id}</p>`,
			},
			validateProps: (raw) => raw,
			normalize: (block) => block,
		};

		expect(() => hostMayDetach(schema)).not.toThrow();
	});
});
