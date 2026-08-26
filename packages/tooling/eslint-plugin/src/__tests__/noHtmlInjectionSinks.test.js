import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noHtmlInjectionSinks } from "../rules/noHtmlInjectionSinks.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: { ecmaFeatures: { jsx: true } },
	},
});

describe("no-html-injection-sinks (SEC2)", () => {
	it("bans every markup sink and leaves DOM building alone", () => {
		ruleTester.run("no-html-injection-sinks", noHtmlInjectionSinks, {
			valid: [
				{ code: 'element.textContent = "<b>not markup</b>";' },
				{ code: 'anchor.setAttribute("href", resolved);' },
				{ code: 'const parsed = new DOMParser().parseFromString(html, "text/html");' },
				{ code: "const current = element.innerHTML;" },
				{ code: "stream.write(chunk);" },
				{ code: "<div>{children}</div>", filename: "renderer.tsx" },
			],
			invalid: [
				{
					code: "element.innerHTML = markup;",
					errors: [{ messageId: "propertyAssignment", data: { name: "innerHTML" } }],
				},
				{
					code: "element.outerHTML = markup;",
					errors: [{ messageId: "propertyAssignment", data: { name: "outerHTML" } }],
				},
				{
					code: 'element.insertAdjacentHTML("beforeend", markup);',
					errors: [{ messageId: "method", data: { name: "insertAdjacentHTML" } }],
				},
				{
					code: "range.createContextualFragment(markup);",
					errors: [{ messageId: "method", data: { name: "createContextualFragment" } }],
				},
				{
					code: "document.write(markup);",
					errors: [{ messageId: "documentWrite", data: { name: "write" } }],
				},
				{
					code: "globalThis.document.writeln(markup);",
					errors: [{ messageId: "documentWrite", data: { name: "writeln" } }],
				},
				{
					code: "<div dangerouslySetInnerHTML={{ __html: markup }} />",
					filename: "renderer.tsx",
					errors: [{ messageId: "jsxAttribute" }],
				},
			],
		});
	});
});
