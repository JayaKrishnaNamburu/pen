import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noBareRandomUuid } from "../rules/noBareRandomUuid.js";

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

describe("no-bare-random-uuid (HOST4)", () => {
	it("bans direct randomUUID calls and leaves the helper alone", () => {
		ruleTester.run("no-bare-random-uuid", noBareRandomUuid, {
			valid: [
				{ code: "const id = generateId();" },
				{ code: 'import { generateId } from "@input/pen-types";' },
				// the helper itself must call the API it wraps
				{
					code: "const id = crypto.randomUUID();",
					filename: "packages/types/src/utils/generateId.ts",
				},
				// a feature test in the helper is also a member access, and also allowed there
				{
					code: 'if (typeof crypto.randomUUID === "function") { generate(); }',
					filename: "packages/types/src/utils/generateId.ts",
				},
			],
			invalid: [
				{
					code: "const id = crypto.randomUUID();",
					errors: [{ messageId: "bareCall" }],
				},
				{
					code: "const viewId = globalThis.crypto.randomUUID();",
					errors: [{ messageId: "bareCall" }],
				},
				{
					code: "const id = options.suggestionId ?? crypto.randomUUID();",
					errors: [{ messageId: "bareCall" }],
				},
				// a feature test outside the helper means someone is re-implementing the fallback
				{
					code: 'const has = typeof crypto.randomUUID === "function";',
					errors: [{ messageId: "bareCall" }],
				},
			],
		});
	});
});
