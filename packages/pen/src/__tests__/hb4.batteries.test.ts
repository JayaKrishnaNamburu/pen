import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultPreset } from "../index";

const README = readFileSync(join(import.meta.dirname, "../../README.md"), "utf8");

/**
 * HB4: the README table is the declaration. Parsing it here means a
 * drift is a test failure, not two literals that can lie together.
 */
function declaredExtensionNames(readme: string): string[] {
	const header = readme.indexOf("| Extension name");
	if (header < 0) {
		throw new Error(
			"HB4: README is missing the '| Extension name | Package |' battery table",
		);
	}

	const after = readme.slice(header);
	const tableEnd = after.search(/\n(?!\|)/);
	const table = tableEnd === -1 ? after : after.slice(0, tableEnd);
	const names: string[] = [];

	for (const line of table.split("\n")) {
		const match = /^\| `([^`]+)`\s+\| `([^`]+)`\s+\|/.exec(line);
		if (match) {
			names.push(match[1]);
		}
	}

	if (names.length === 0) {
		throw new Error("HB4: README battery table declared no extensions");
	}

	return names;
}

describe("HB4: preset batteries match the README declaration", () => {
	it("the constructed preset's extension list equals the declared list", () => {
		const declared = declaredExtensionNames(README);
		const assembled = (
			defaultPreset().resolve({
				schema: {} as never,
				documentProfile: "structured",
			}).extensions ?? []
		).map((extension) => extension.name);

		expect(assembled).toEqual(declared);
	});
});
