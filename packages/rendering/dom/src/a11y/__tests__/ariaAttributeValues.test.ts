import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const A11Y_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ARIA_BOOLEANS = new Set([
	"aria-atomic",
	"aria-busy",
	"aria-disabled",
	"aria-expanded",
	"aria-hidden",
	"aria-modal",
	"aria-multiline",
	"aria-multiselectable",
	"aria-readonly",
	"aria-required",
	"aria-selected",
]);

function listProductionSources(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "__tests__") {
				continue;
			}
			files.push(...listProductionSources(path));
			continue;
		}
		if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
			files.push(path);
		}
	}
	return files;
}

describe("a11y attribute values", () => {
	it("ARIA boolean setAttribute values in a11y are the literal strings true/false", () => {
		const bad: string[] = [];
		const call =
			/\.setAttribute\(\s*(["'`])(aria-[\w-]+)\1\s*,\s*(["'`])(.*?)\3\s*\)/g;
		for (const file of listProductionSources(A11Y_ROOT)) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(call)) {
				const name = match[2]!;
				const value = match[4]!;
				if (
					ARIA_BOOLEANS.has(name) &&
					value !== "true" &&
					value !== "false"
				) {
					bad.push(`${file}: ${name}="${value}"`);
				}
			}
		}
		expect(bad).toEqual([]);
	});

	it("aria-live tokens stay polite/assertive, not a bare presence attribute", () => {
		const bad: string[] = [];
		const call =
			/\.setAttribute\(\s*(["'`])aria-live\1\s*,\s*(["'`])(.*?)\2\s*\)/g;
		for (const file of listProductionSources(A11Y_ROOT)) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(call)) {
				const value = match[3]!;
				if (value !== "polite" && value !== "assertive") {
					bad.push(`${file}: aria-live="${value}"`);
				}
			}
		}
		expect(bad).toEqual([]);
	});
});
