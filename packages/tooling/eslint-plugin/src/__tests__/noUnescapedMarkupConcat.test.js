import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noUnescapedMarkupConcat } from "../rules/noUnescapedMarkupConcat.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
	},
});

describe("no-unescaped-markup-concat (SEC5)", () => {
	it("requires escaping or a named justification in markup templates", () => {
		ruleTester.run("no-unescaped-markup-concat", noUnescapedMarkupConcat, {
			valid: [
				{ code: 'const html = `<p>${escapeHtml(src)}</p>`;' },
				{ code: 'const html = `<p>${escapeMarkupText(src)}</p>`;' },
				{ code: 'const html = `<a href="${escapeMarkupAttribute(href)}">x</a>`;' },
				{ code: 'const html = `<p>${block.content ?? ""}</p>`;' },
				{ code: 'const html = `<strong>${text}</strong>`;' },
				{ code: 'const html = `<${tag}>${innerSerialized}</${tag}>`;' },
				{
					code: "const checked = on ? \" checked\" : \"\";\nconst html = `<input type=\"checkbox\"${checked} />`;",
				},
				{
					code: "const langAttr = lang ? ` class=\"language-${escapeHtml(lang)}\"` : \"\";\nconst html = `<code${langAttr}></code>`;",
				},
				{
					code: "for (const [name, raw] of Object.entries(attributes)) {\n  result += ` ${name}=\"${escapeMarkupAttribute(String(raw))}\"`;\n}",
				},
				{
					code: "const open = serializeMarkupOpenTag(\"img\");\nreturn `${open.slice(0, -1)} />`;",
				},
				{
					code: "// SEC5: clamped heading level\nconst html = `<h${level}>${block.content}</h${level}>`;",
				},
				{
					code: 'const note = `node segment props for ${nodeType}`;',
				},
				{
					code: 'const html = serializeMarkupElement("p", undefined, serializeMarkupText(src));',
				},
				{
					code: "const html = `<table>${rows.map((cell) => `<td>${escapeHtml(cell)}</td>`).join(\"\")}</table>`;",
				},
			],
			invalid: [
				{
					code: 'const html = `<img src="${src}" />`;',
					errors: [{ messageId: "unescaped" }],
				},
				{
					code: 'const html = `<img src="${block.props.src}" />`;',
					errors: [{ messageId: "unescaped" }],
				},
				{
					code: 'const html = `<p>${String(block.props.label)}</p>`;',
					errors: [{ messageId: "unescaped" }],
				},
				{
					code: 'const html = `<a href="${href}">${label}</a>`;',
					errors: [{ messageId: "unescaped" }, { messageId: "unescaped" }],
				},
			],
		});
	});
});
