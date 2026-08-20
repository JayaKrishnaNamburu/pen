import { describe, expect, it } from "vitest";

import {
	DEFAULT_UNDO_MAX_DEPTH,
	undoExtension,
} from "../undoExtension";

describe("@input/pen-undo maxDepth", () => {
	it("CH7 accepts undoExtension({ maxDepth }) and defaults to 500", () => {
		expect(DEFAULT_UNDO_MAX_DEPTH).toBe(500);

		const withDefault = undoExtension();
		const withExplicitDefault = undoExtension({
			maxDepth: DEFAULT_UNDO_MAX_DEPTH,
		});
		const withCustom = undoExtension({ maxDepth: 100 });

		expect(withDefault.name).toBe("undo");
		expect(withExplicitDefault.name).toBe("undo");
		expect(withCustom.name).toBe("undo");
	});
});
