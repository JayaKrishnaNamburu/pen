import { readFileSync } from "node:fs";
import path from "node:path";
import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { noFrameworkFreeModulesInRenderers } from "../rules/noFrameworkFreeModulesInRenderers.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
const allowlistPath = path.join(
	repoRoot,
	"scripts/renderer-framework-free-allowlist.json",
);

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

const reactFile = "packages/rendering/react/src/utils/example.ts";
const vueFile = "packages/rendering/vue/src/internal/example.ts";

describe("no-framework-free-modules-in-renderers (API6)", () => {
	it("API6: flags framework-free renderer modules and leaves stubs and coupled files alone", () => {
		ruleTester.run(
			"no-framework-free-modules-in-renderers",
			noFrameworkFreeModulesInRenderers,
			{
				valid: [
					{
						code: 'import { useState } from "react";\nexport function useFlag() { return useState(false); }\n',
						filename: reactFile,
					},
					{
						code: 'import type { ReactNode } from "react";\nexport const empty: ReactNode = null;\n',
						filename: reactFile,
					},
					{
						code: 'import { createPortal } from "react-dom";\nexport const portal = createPortal;\n',
						filename: reactFile,
					},
					{
						code: "export function Icon() { return <span /> }\n",
						filename: "packages/rendering/react/src/primitives/icon.tsx",
					},
					{
						code: 'export { isDevelopmentEnvironment } from "@input/pen-dom/utils/environment";\n',
						filename: "packages/rendering/react/src/utils/environment.ts",
					},
					{
						code: 'export * from "@input/pen-dom/utils/clipboardPayload";\n',
						filename: "packages/rendering/react/src/utils/clipboardPayload.ts",
					},
					{
						code: '"use client";\nexport { Foo } from "./foo";\nexport type { FooProps } from "./foo";\n',
						filename: "packages/rendering/react/src/ai.ts",
					},
					{
						code: 'import { ref } from "vue";\nexport function useValue() { return ref(0); }\n',
						filename: vueFile,
					},
					{
						code: "export function add(a, b) { return a + b; }\n",
						filename: "packages/core/src/utils/math.ts",
					},
					{
						code: "/* API6: Wave T T.1 owns clipboard */\nexport function serialize() { return \"\"; }\n",
						filename: reactFile,
					},
					{
						code: "export function serialize() { return \"\"; }\n",
						filename: "packages/rendering/react/src/utils/clipboardSerialization.ts",
						options: [
							{
								allowlist: [
									{
										file: "packages/rendering/react/src/utils/clipboardSerialization.ts",
										reason: "Wave T step T.1 owns clipboard relocation",
									},
								],
							},
						],
					},
				],
				invalid: [
					{
						code: "export function add(a, b) { return a + b; }\n",
						filename: reactFile,
						errors: [{ messageId: "frameworkFree" }],
					},
					{
						code: "export const FIELD_EDITOR_SLOT_KEY = \"react:field-editor\";\n",
						filename: "packages/rendering/react/src/constants/fieldEditor.ts",
						options: [{ allowlist: [] }],
						errors: [{ messageId: "frameworkFree" }],
					},
					{
						code: "export function resolvePlaceholder() { return \"\"; }\n",
						filename: vueFile,
						errors: [{ messageId: "frameworkFree" }],
					},
					{
						code: "// API6\nexport function leftover() { return 1; }\n",
						filename: reactFile,
						errors: [{ messageId: "frameworkFree" }],
					},
				],
			},
		);
	});

	it("API6: every committed allowlist entry names a reason", () => {
		const parsed = JSON.parse(readFileSync(allowlistPath, "utf8"));
		expect(Array.isArray(parsed.modules)).toBe(true);
		for (const entry of parsed.modules) {
			expect(typeof entry.file).toBe("string");
			expect(entry.file.length).toBeGreaterThan(0);
			expect(typeof entry.reason).toBe("string");
			expect(entry.reason.trim().length).toBeGreaterThan(0);
		}
	});
});
