import { describe, expect, it } from "vitest";
import { defineExtension } from "../schema/defineExtension";

describe("defineExtension", () => {
	it("produces extension with default version", () => {
		const ext = defineExtension({ name: "my-ext" });
		expect(ext.name).toBe("my-ext");
		expect(ext.version).toBe("0.0.0");
	});

	it("preserves custom version", () => {
		const ext = defineExtension({ name: "x", version: "1.0.0" });
		expect(ext.version).toBe("1.0.0");
	});

	it("preserves all fields", () => {
		const ext = defineExtension({
			name: "x",
			version: "1.0.0",
			dependencies: ["y"],
		});
		expect(ext.dependencies).toEqual(["y"]);
	});

	it("preserves dependencies", () => {
		const ext = defineExtension({
			name: "x",
			dependencies: ["y", "z"],
		});
		expect(ext.dependencies).toEqual(["y", "z"]);
	});
});
