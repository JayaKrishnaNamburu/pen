import { readFileSync } from "node:fs";
import path from "node:path";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import {
	missingAllowlistField,
	noAboveFloorApi,
} from "../rules/noAboveFloorApi.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const allowlistPath = path.join(
	repoRoot,
	"scripts/above-floor-api-allowlist.json",
);

describe("no-above-floor-api (HOST4)", () => {
	it("HOST4: flags bare above-floor APIs and leaves feature tests alone", () => {
		ruleTester.run("no-above-floor-api", noAboveFloorApi, {
			valid: [
				{
					code: 'if ("EditContext" in globalThis && typeof globalThis.EditContext === "function") { useBackend(); }\n',
					filename: "packages/rendering/dom/src/field-editor/fieldEditorImplRuntime.ts",
				},
				{
					code: "const Ctor = (globalThis as { EditContext?: unknown }).EditContext;\nif (!Ctor) { throw new Error(\"missing\"); }\n",
					filename: "packages/rendering/dom/src/field-editor/editContextBackendCore.ts",
				},
				{
					code: "const clone = globalThis.structuredClone;\nif (typeof clone === \"function\") { return clone(value); }\nreturn JSON.parse(JSON.stringify(value));\n",
					filename: "packages/rendering/react/src/utils/structuredPreview.ts",
				},
				{
					code: "const copy = globalThis.structuredClone?.(value);\n",
					filename: "packages/rendering/react/src/utils/preview.ts",
				},
				{
					code: "let observer: ResizeObserver | null = null;\nif (typeof ResizeObserver !== \"undefined\") { observer = new ResizeObserver(() => {}); }\n",
					filename: "packages/rendering/react/src/primitives/ai/contextualPromptSurface.tsx",
				},
				{
					code: "if (typeof element.replaceChildren === \"function\") { element.replaceChildren(); }\n",
					filename: "packages/rendering/dom/src/utils/replaceElementChildren.ts",
				},
				{
					code: "function resolve(locale) {\n  if (typeof Intl === \"undefined\" || typeof Intl.Segmenter !== \"function\") { return null; }\n  return new Intl.Segmenter(locale, { granularity: \"word\" });\n}\n",
					filename: "packages/core/src/editor/textSegmentation.ts",
				},
				{
					code: "const styles = [\"background: #2563eb\", \"background: color-mix(in srgb, #2563eb 12%, transparent)\"];\n",
					filename: "packages/extensions/ai/src/review/reviewPresentationStyles.ts",
				},
				{
					code: "const style = { backgroundColor: \"#2563eb\", background: \"color-mix(in srgb, #2563eb 12%, transparent)\" };\n",
					filename: "packages/rendering/react/src/primitives/ai/contextualPromptSurface.tsx",
				},
			],
			invalid: [
				{
					code: "const next = structuredClone(value);\n",
					filename: "packages/rendering/react/src/utils/bareClone.ts",
					errors: [{ messageId: "bareUse", data: { api: "structuredClone" } }],
				},
				{
					code: "const ctx = new EditContext({ text: \"\" });\n",
					filename: "packages/rendering/dom/src/field-editor/bareEditContext.ts",
					errors: [{ messageId: "bareUse", data: { api: "EditContext" } }],
				},
				{
					code: "const observer = new ResizeObserver(() => {});\n",
					filename: "packages/rendering/react/src/primitives/ai/bareResize.ts",
					errors: [{ messageId: "bareUse", data: { api: "ResizeObserver" } }],
				},
				{
					code: "element.replaceChildren();\n",
					filename: "packages/rendering/react/src/primitives/editor/bareReplace.ts",
					errors: [{ messageId: "bareUse", data: { api: "replaceChildren" } }],
				},
				{
					code: "if (Object.hasOwn(raw, key)) { keep(key); }\n",
					filename: "packages/extensions/import-html/src/bareHasOwn.ts",
					errors: [{ messageId: "bareUse", data: { api: "Object.hasOwn" } }],
				},
				{
					code: "const last = items.at(-1);\n",
					filename: "packages/extensions/ai/src/bareAt.ts",
					errors: [{ messageId: "bareUse", data: { api: "Array.prototype.at" } }],
				},
				{
					code: "const style = { background: \"color-mix(in srgb, #2563eb 12%, transparent)\" };\n",
					filename: "packages/extensions/ai/src/review/bareMix.ts",
					errors: [{ messageId: "bareUse", data: { api: "color-mix" } }],
				},
				{
					code: "return new Intl.Segmenter(locale, { granularity: \"word\" });\n",
					filename: "packages/core/src/editor/bareSegmenter.ts",
					errors: [{ messageId: "bareUse", data: { api: "Intl.Segmenter" } }],
				},
			],
		});
	});

	it("HOST4: an allowlist entry with no fallback is a rule error", () => {
		ruleTester.run("no-above-floor-api", noAboveFloorApi, {
			valid: [],
			invalid: [
				{
					code: "const ok = true;\n",
					filename: "packages/core/src/empty.ts",
					options: [
						{
							allowlist: [
								{
									api: "structuredClone",
									fallback: "",
									degradation: "drops non-JSON values",
									sites: [],
								},
							],
						},
					],
					errors: [
						{
							messageId: "incompleteAllowlist",
							data: { api: "structuredClone", field: "fallback" },
						},
					],
				},
			],
		});
	});

	it("HOST4: every committed allowlist entry names fallback and degradation", () => {
		const parsed = JSON.parse(readFileSync(allowlistPath, "utf8"));
		expect(Array.isArray(parsed.apis)).toBe(true);
		expect(parsed.apis.length).toBeGreaterThan(0);
		for (const entry of parsed.apis) {
			expect(missingAllowlistField(entry)).toBeNull();
			expect(Array.isArray(entry.sites)).toBe(true);
		}
		const apis = parsed.apis.map((entry) => entry.api);
		expect(apis).toEqual([
			"EditContext",
			"structuredClone",
			"ResizeObserver",
			"replaceChildren",
			"Object.hasOwn",
			"Array.prototype.at",
			"color-mix",
			"Intl.Segmenter",
		]);
	});
});
