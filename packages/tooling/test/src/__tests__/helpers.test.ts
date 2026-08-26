import { describe, expect, it } from "vitest";
import { createTestDocument, resetTestIdCounter } from "../index";

describe("resetTestIdCounter", () => {
	it("makes generated fixture ids repeatable", () => {
		resetTestIdCounter();
		const first = createTestDocument([{ type: "paragraph", content: "A" }]);
		const firstId = first.ydoc.getArray<string>("blockOrder").get(0);
		first.ydoc.destroy();

		resetTestIdCounter();
		const second = createTestDocument([{ type: "paragraph", content: "A" }]);
		const secondId = second.ydoc.getArray<string>("blockOrder").get(0);
		second.ydoc.destroy();

		expect(firstId).toBe("test-block-1");
		expect(secondId).toBe(firstId);
	});
});
