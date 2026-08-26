// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createEditor, urlPolicyFacet } from "@input/pen-core";
import { fullReconcileDeltasToDOM } from "../../field-editor/reconciler";
import { createMarkedNode } from "../../field-editor/reconcilerMarks";
import { resolveEditorUrl, urlPolicyFromEditor } from "../resolveEditorUrl";
import { urlPolicy } from "../urlPolicy";
import { urlPolicyExtension } from "../urlPolicyExtension";
import { defaultSchema } from "@input/pen-schema-default";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const registry = {
	resolveInline: () => null,
};

describe("SEC1 / S.1-facet host binding", () => {
	it("SEC1 / S.1-facet: empty editor uses the default urlPolicy", () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
		});

		expect(editor.facet(urlPolicyFacet)).toBeUndefined();
		expect(urlPolicyFromEditor(editor)).toBe(urlPolicy);
		expect(resolveEditorUrl(editor, "javascript:alert(1)", "link")).toBe(
			null,
		);
		expect(resolveEditorUrl(editor, "https://example.com/a", "link")).toBe(
			"https://example.com/a",
		);

		editor.destroy();
	});

	it("SEC1 / S.1-facet: wrap receives the default policy to delegate to", () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
			extensions: [
				urlPolicyExtension((defaults) => ({
					resolve(raw, context) {
						if (raw === "blob:host") {
							return "blob:host";
						}
						return defaults.resolve(raw, context);
					},
				})),
			],
		});

		expect(resolveEditorUrl(editor, "blob:host", "link")).toBe("blob:host");
		expect(resolveEditorUrl(editor, "javascript:alert(1)", "link")).toBe(
			null,
		);
		expect(resolveEditorUrl(editor, "https://example.com/a", "image")).toBe(
			"https://example.com/a",
		);

		editor.destroy();
	});

	it("SEC1 / S.1-facet: createMarkedNode uses the host policy", () => {
		const policy = urlPolicyExtension((defaults) => ({
			resolve(raw, context) {
				if (raw === "blob:host") {
					return "blob:host";
				}
				return defaults.resolve(raw, context);
			},
		}));
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
			extensions: [policy],
		});
		const hostPolicy = urlPolicyFromEditor(editor);

		const allowed = createMarkedNode(
			"ok",
			{ link: { href: "blob:host" } },
			registry as never,
			hostPolicy,
		) as HTMLAnchorElement;
		expect(allowed.tagName).toBe("A");
		expect(allowed.getAttribute("href")).toBe("blob:host");
		expect(allowed.hasAttribute("data-pen-blocked-url")).toBe(false);

		const blocked = createMarkedNode(
			"no",
			{ link: { href: "javascript:alert(1)" } },
			registry as never,
			hostPolicy,
		) as HTMLAnchorElement;
		expect(blocked.hasAttribute("href")).toBe(false);
		expect(blocked.getAttribute("data-pen-blocked-url")).toBe("");

		editor.destroy();
	});

	it("SEC1: fullReconcileDeltasToDOM honors the host wrap from editor", () => {
		const hostile = "https://blocked.example/x";
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
			extensions: [
				urlPolicyExtension((defaults) => ({
					resolve(raw, context) {
						if (raw === hostile) {
							return null;
						}
						return defaults.resolve(raw, context);
					},
				})),
			],
		});
		const element = document.createElement("span");
		fullReconcileDeltasToDOM(
			[{ insert: "click", attributes: { link: { href: hostile } } }],
			element,
			defaultSchema,
			{ editor },
		);

		const anchor = element.querySelector("a");
		expect(anchor).toBeInstanceOf(HTMLAnchorElement);
		expect(anchor?.hasAttribute("href")).toBe(false);
		expect(anchor?.getAttribute("data-pen-blocked-url")).toBe("");
		expect(element.innerHTML).not.toContain("blocked.example");
		expect(element.innerHTML).not.toContain(hostile);

		editor.destroy();
	});
});
