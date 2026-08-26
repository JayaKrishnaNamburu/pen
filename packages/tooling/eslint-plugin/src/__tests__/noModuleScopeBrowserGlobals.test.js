import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";
import { noModuleScopeBrowserGlobals } from "../rules/noModuleScopeBrowserGlobals.js";

const ruleTester = new RuleTester({
	languageOptions: { parser: tseslint.parser },
});

describe("no-module-scope-browser-globals (HOST2)", () => {
	it("flags module-scope browser globals and leaves function bodies alone", () => {
		ruleTester.run(
			"no-module-scope-browser-globals",
			noModuleScopeBrowserGlobals,
			{
				valid: [
					{ code: "function read() { return document.title; }" },
					{ code: "const read = () => window.innerWidth;" },
					{
						code: "const handlers = { click() { return navigator.platform; } };",
					},
					{
						code: "class View { measure() { return getComputedStyle(this.el); } }",
					},
					{
						code: "class View { el = document.createElement('div'); }",
					},
					{
						code: "export function tick(fn) { return requestAnimationFrame(fn); }",
					},
					{
						code: "function storage() { return localStorage.getItem('k'); }",
					},
					{
						code: "function query(q) { return matchMedia(q).matches; }",
					},
					{ code: "type Doc = typeof document;" },
					{ code: "const counts = new Map<Document, number>();" },
					{ code: "const title = editor.document;" },
					{ code: "const copy = { document: 1, window: 2 };" },
				],
				invalid: [
					{
						code: "const title = document.title;",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "document" },
							},
						],
					},
					{
						code: "const isMac = navigator.platform === 'MacIntel';",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "navigator" },
							},
						],
					},
					{
						code: "const width = window.innerWidth;",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "window" },
							},
						],
					},
					{
						code: "const hasDom = typeof window !== 'undefined';",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "window" },
							},
						],
					},
					{
						code: "const title = globalThis.document.title;",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "document" },
							},
						],
					},
					{
						code: "const title = global.document.title;",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "document" },
							},
						],
					},
					{
						code: "class View { static root = document.body; }",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "document" },
							},
						],
					},
					{
						code: "const dark = matchMedia('(prefers-color-scheme: dark)');",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "matchMedia" },
							},
						],
					},
					{
						code: "const token = localStorage.getItem('token');",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "localStorage" },
							},
						],
					},
					{
						code: "const style = getComputedStyle(globalThis);",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "getComputedStyle" },
							},
						],
					},
					{
						code: "const id = requestAnimationFrame(() => {});",
						errors: [
							{
								messageId: "moduleScope",
								data: { name: "requestAnimationFrame" },
							},
						],
					},
				],
			},
		);
	});
});
