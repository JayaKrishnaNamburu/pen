// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { SchemaRegistry } from "@input/pen-types";
import {
	applyElementAttributes,
	createMarkedNode,
} from "../field-editor/reconcilerMarks";

const registry = {
	resolveInline: () => null,
} as unknown as SchemaRegistry;

describe("applyElementAttributes", () => {
	it("SEC2: onmouseover key dropped", () => {
		const element = document.createElement("span");
		applyElementAttributes(element, {
			onmouseover: "alert(1)",
			OnClick: "alert(1)",
			"data-ok": "yes",
		});

		expect(element.hasAttribute("onmouseover")).toBe(false);
		expect(element.hasAttribute("onclick")).toBe(false);
		expect(element.getAttribute("data-ok")).toBe("yes");
		expect(element.onmouseover).toBeNull();
	});

	it("SEC2: style cssText refused", () => {
		const element = document.createElement("span");
		applyElementAttributes(element, {
			style: "background:url(javascript:alert(1))",
			"data-ok": "yes",
		});

		expect(element.getAttribute("style")).toBeNull();
		expect(element.style.cssText).toBe("");
		expect(element.getAttribute("data-ok")).toBe("yes");
	});

	it("SEC2: safe attributes still apply", () => {
		const element = document.createElement("span");
		const title = `"><img src=x onerror=alert(1)>`;
		applyElementAttributes(element, {
			class: "pen-mark",
			title,
			hidden: true,
			"data-pen-id": "abc",
		});

		expect(element.className).toBe("pen-mark");
		expect(element.getAttribute("title")).toBe(title);
		expect(element.hasAttribute("hidden")).toBe(true);
		expect(element.getAttribute("data-pen-id")).toBe("abc");
		expect(element.querySelector("img")).toBeNull();
		expect(element.children.length).toBe(0);
	});

	it("SEC1: javascript: href omitted with data-pen-blocked-url", () => {
		const element = document.createElement("span");
		applyElementAttributes(element, {
			href: "javascript:alert(1)",
			"data-ok": "yes",
		});

		expect(element.hasAttribute("href")).toBe(false);
		expect(element.getAttribute("data-pen-blocked-url")).toBe("");
		expect(element.getAttribute("data-ok")).toBe("yes");
		expect(element.outerHTML).not.toContain("javascript:");
	});
});

describe("createMarkedNode link href", () => {
	it("SEC1 / F1: javascript: mark does not land in the DOM href", () => {
		const node = createMarkedNode(
			"click",
			{ link: { href: "javascript:alert(1)" } },
			registry,
		) as HTMLElement;

		expect(node.tagName).toBe("A");
		expect(node.hasAttribute("href")).toBe(false);
		expect(node.getAttribute("href")).toBeNull();
		expect(node.getAttribute("data-pen-blocked-url")).toBe("");
		expect(node.outerHTML).not.toContain("javascript:");
	});

	it("SEC1: allowed https href still lands on the mark", () => {
		const node = createMarkedNode(
			"click",
			{ link: { href: "https://example.com/docs" } },
			registry,
		) as HTMLAnchorElement;

		expect(node.tagName).toBe("A");
		expect(node.getAttribute("href")).toBe("https://example.com/docs");
		expect(node.hasAttribute("data-pen-blocked-url")).toBe(false);
	});
});
