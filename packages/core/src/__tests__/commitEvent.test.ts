import { describe, expect, it } from "vitest";

import { resolveCommitSource, toStructuredOrigin } from "../editor/commitEvent";

describe("commitEvent helpers (Wave 2.2)", () => {
	it("toStructuredOrigin wraps string origins", () => {
		expect(toStructuredOrigin("user")).toEqual({ type: "user" });
		expect(toStructuredOrigin({ type: "ai", requestId: "r1" })).toEqual({
			type: "ai",
			requestId: "r1",
		});
	});

	it("resolveCommitSource maps history / collaborator / stream", () => {
		expect(resolveCommitSource("user", "apply")).toBe("apply");
		expect(resolveCommitSource("collaborator", "apply")).toBe("remote");
		expect(resolveCommitSource("history", "apply")).toBe("undo");
		expect(resolveCommitSource({ type: "history" }, "apply")).toBe("undo");
		expect(
			resolveCommitSource({ type: "history", source: "redo" }, "apply"),
		).toBe("redo");
		expect(
			resolveCommitSource({ type: "ai", source: "stream" }, "apply"),
		).toBe("stream");
		expect(resolveCommitSource("user", "remote")).toBe("remote");
	});
});
