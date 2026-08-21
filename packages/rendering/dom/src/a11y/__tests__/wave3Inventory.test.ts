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

describe("a11y wave-3 inventory", () => {
	it("every setAttribute in a11y production sources is wave-3-adopt or wave-3-exempt", () => {
		const unmarked: string[] = [];
		for (const file of listProductionSources(A11Y_ROOT)) {
			const lines = readFileSync(file, "utf8").split("\n");
			for (let index = 0; index < lines.length; index += 1) {
				if (!lines[index]!.includes(".setAttribute(")) {
					continue;
				}
				const window = lines
					.slice(Math.max(0, index - 8), index + 1)
					.join("\n");
				if (!/wave-3-(adopt|exempt)/.test(window)) {
					unmarked.push(`${file}:${index + 1}`);
				}
			}
		}
		// `rg wave-3-adopt` is not the inventory. Exempt focus-sink
		// writes must stay marked so Wave 3.4 does not convert them.
		expect(unmarked).toEqual([]);
	});

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

	it("focus-sink setAttribute sites are wave-3-exempt, never wave-3-adopt", () => {
		const source = readFileSync(join(A11Y_ROOT, "focusSink.ts"), "utf8");
		const lines = source.split("\n");
		const sites: string[] = [];
		for (let index = 0; index < lines.length; index += 1) {
			if (!lines[index]!.includes(".setAttribute(")) {
				continue;
			}
			const window = lines
				.slice(Math.max(0, index - 8), index + 1)
				.join("\n");
			expect(window, `focusSink.ts:${index + 1}`).toMatch(
				/wave-3-exempt/,
			);
			expect(window, `focusSink.ts:${index + 1}`).not.toMatch(
				/wave-3-adopt/,
			);
			sites.push(`focusSink.ts:${index + 1}`);
		}
		// construction marker, hide aria-hidden, reveal aria-label
		expect(sites).toHaveLength(3);
	});

	it("announcer announcement writes are wave-3-adopt; construction is wave-3-exempt", () => {
		const source = readFileSync(join(A11Y_ROOT, "announcer.ts"), "utf8");
		const writeStart = source.indexOf("function write(");
		const constructStart = source.indexOf("function createLiveRegion(");
		expect(writeStart).toBeGreaterThan(-1);
		expect(constructStart).toBeGreaterThan(writeStart);

		const writeBody = source.slice(writeStart, constructStart);
		expect(writeBody).toMatch(/wave-3-adopt/);
		expect(writeBody).not.toMatch(/wave-3-exempt/);

		const constructBody = source.slice(constructStart);
		expect(constructBody).toMatch(/wave-3-exempt/);
		expect(constructBody).not.toMatch(/wave-3-adopt/);
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
