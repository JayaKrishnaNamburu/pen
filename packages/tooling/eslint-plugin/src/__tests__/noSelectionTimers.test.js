import { readFileSync } from "node:fs";
import path from "node:path";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import {
	isSelectionModule,
	missingAllowlistField,
	noSelectionTimers,
} from "../rules/noSelectionTimers.js";

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const allowlistPath = path.join(
	import.meta.dirname,
	"../rules/no-selection-timers-allowlist.json",
);
const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));

// Synthetic sources keyed by a real selection-module path. Reading the actual
// file here is what made the previous version of this suite go red when the
// Firefox projection fix deleted the two rAFs it had pinned: the assertions
// described a tree state rather than the rule's behavior.
const authorityPath =
	"packages/rendering/dom/src/field-editor/selectionAuthority.ts";

const allowlistedRaf = `
function applySelectionUntilNextFrame() {
	requestAnimationFrame(() => {
		void 0;
	});
}
`;

const allowlistedSymbolWithoutRaf = `
function applySelectionUntilNextFrame() {
	void 0;
}
`;

describe("no-selection-timers (S4)", () => {
	it("treats selection modules as in scope and everything else as out", () => {
		expect(isSelectionModule(authorityPath)).toBe(true);
		expect(
			isSelectionModule(
				"packages/rendering/dom/src/field-editor/selectionBridge.ts",
			),
		).toBe(true);
		expect(isSelectionModule("packages/core/src/editor/selection.ts")).toBe(
			true,
		);
		expect(isSelectionModule("packages/docs/src/pages/Selection.tsx")).toBe(
			true,
		);
		// prefix-only `^selection` walked past these; they are selection modules
		expect(
			isSelectionModule(
				"packages/rendering/dom/src/field-editor/contenteditableBackendSelection.ts",
			),
		).toBe(true);
		expect(
			isSelectionModule(
				"packages/rendering/react/src/hooks/useSelectionToolbar.ts",
			),
		).toBe(true);
		expect(
			isSelectionModule(
				"packages/rendering/react/src/primitives/editor/inlineAtomSelectionInteraction.ts",
			),
		).toBe(true);
		expect(
			isSelectionModule(
				"packages/core/src/editor/editorSelectionMutations.ts",
			),
		).toBe(true);
		expect(
			isSelectionModule(
				"packages/rendering/dom/src/field-editor/fieldEditor.ts",
			),
		).toBe(false);
		expect(
			isSelectionModule(
				"packages/rendering/dom/src/field-editor/focusController.ts",
			),
		).toBe(false);
		expect(
			isSelectionModule(
				"packages/rendering/dom/src/field-editor/cellEditingController.ts",
			),
		).toBe(false);
		expect(
			isSelectionModule(
				"packages/rendering/dom/src/__tests__/selectionBridge.test.ts",
			),
		).toBe(false);
	});

	it("S4: every allowlist entry names file, symbol, kind, and a retiring wave", () => {
		expect(allowlist.entries.length).toBeGreaterThan(0);
		for (const entry of allowlist.entries) {
			expect(missingAllowlistField(entry)).toBeNull();
			expect(entry.reason).toMatch(/Wave \d+/);
		}
	});

	// A waiver for a call that no longer exists is how this list turns into a
	// parking lot, and it is the exact drift that broke the previous suite.
	it("S4: every allowlist entry is still live in the file it names", () => {
		for (const entry of allowlist.entries) {
			const source = readFileSync(path.join(repoRoot, entry.file), "utf8");
			expect(source).toContain(entry.kind);
			expect(source).toContain(entry.symbol);
		}
	});

	it("S4: a stale allowlist entry naming a file with no such timer fails liveness", () => {
		const stale = {
			file: "packages/core/src/editor/selection.ts",
			symbol: "ghostTimerThatDoesNotExist",
			kind: "setTimeout",
			reason: "Wave 99 stale entry for the liveness mutation",
		};
		const source = readFileSync(path.join(repoRoot, stale.file), "utf8");
		expect(source.includes(stale.kind) && source.includes(stale.symbol)).toBe(
			false,
		);
		expect(() => {
			expect(source).toContain(stale.kind);
			expect(source).toContain(stale.symbol);
		}).toThrow();
	});

	it("bans timers in selection modules and honours the allowlist", () => {
		ruleTester.run("no-selection-timers", noSelectionTimers, {
			valid: [
				{
					code: "setTimeout(() => {}, 0);\n",
					filename: "packages/rendering/dom/src/field-editor/fieldEditor.ts",
				},
				{
					code: "setTimeout(() => {}, 0);\n",
					filename:
						"packages/rendering/dom/src/__tests__/selectionBridge.test.ts",
				},
				{ code: allowlistedRaf, filename: authorityPath },
			],
			invalid: [
				{
					code: "setTimeout(() => {}, 0);\n",
					filename:
						"packages/rendering/dom/src/field-editor/selectionBridge.ts",
					errors: [{ messageId: "timer", data: { kind: "setTimeout" } }],
				},
				{
					code: "requestAnimationFrame(() => {});\n",
					filename: "packages/core/src/editor/selection.ts",
					errors: [
						{
							messageId: "timer",
							data: { kind: "requestAnimationFrame" },
						},
					],
				},
				{
					code: "window.setImmediate(() => {});\n",
					filename:
						"packages/rendering/dom/src/field-editor/selectionProjectionController.ts",
					errors: [{ messageId: "timer", data: { kind: "setImmediate" } }],
				},
				{
					code: `${allowlistedRaf}\nsetTimeout(() => {}, 16);\n`,
					filename: authorityPath,
					errors: [{ messageId: "timer", data: { kind: "setTimeout" } }],
				},
				{
					code: allowlistedSymbolWithoutRaf,
					filename: authorityPath,
					errors: [
						{
							messageId: "unusedAllowlist",
							data: {
								file: authorityPath,
								symbol: "applySelectionUntilNextFrame",
								kind: "requestAnimationFrame",
							},
						},
					],
				},
			],
		});
	});

	it("the real allowlisted sources lint clean as committed", () => {
		for (const entry of allowlist.entries) {
			const source = readFileSync(path.join(repoRoot, entry.file), "utf8");
			ruleTester.run("no-selection-timers-production", noSelectionTimers, {
				valid: [{ code: source, filename: entry.file }],
				invalid: [],
			});
		}
	});

	it("errors by name when an allowlisted selection module gains a new timer", () => {
		for (const entry of allowlist.entries) {
			const source = readFileSync(path.join(repoRoot, entry.file), "utf8");
			const mutated = `${source}\nsetTimeout(() => { void 0; }, 0);\n`;
			expect(() => {
				ruleTester.run("no-selection-timers-mutation", noSelectionTimers, {
					valid: [],
					invalid: [
						{
							code: mutated,
							filename: entry.file,
							errors: [
								{ messageId: "timer", data: { kind: "setTimeout" } },
							],
						},
					],
				});
			}).not.toThrow();
		}
	});
});
