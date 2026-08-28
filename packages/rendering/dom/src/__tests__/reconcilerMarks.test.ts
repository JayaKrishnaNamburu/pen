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

describe("createMarkedNode RI7 colour marks", () => {
	it("RI7: textColor exposes data-color and paints through --pen-text-color fallback", () => {
		const node = createMarkedNode(
			"hello",
			{ textColor: { color: "red" } },
			registry,
		) as HTMLElement;

		expect(node.tagName).toBe("SPAN");
		expect(node.dataset.markType).toBe("textColor");
		expect(node.dataset.color).toBe("red");
		expect(node.getAttribute("data-color")).toBe("red");
		expect(node.style.getPropertyValue("color")).toBe(
			"var(--pen-text-color, red)",
		);
		expect(node.style.getPropertyValue("--pen-text-color")).toBe("");
		expect(node.style.backgroundColor).toBe("");
	});

	it("RI7: backgroundColor exposes data-color and paints through --pen-background-color fallback", () => {
		const node = createMarkedNode(
			"hello",
			{ backgroundColor: { color: "red" } },
			registry,
		) as HTMLElement;

		expect(node.tagName).toBe("SPAN");
		expect(node.dataset.markType).toBe("backgroundColor");
		expect(node.dataset.color).toBe("red");
		expect(node.style.getPropertyValue("background-color")).toBe(
			"var(--pen-background-color, red)",
		);
		expect(node.style.getPropertyValue("--pen-background-color")).toBe("");
		expect(node.style.color).toBe("");
	});

	it("RI7: highlight exposes data-color and paints through --pen-highlight-color fallback", () => {
		const node = createMarkedNode(
			"hello",
			{ highlight: { color: "yellow" } },
			registry,
		) as HTMLElement;

		// <mark> is semantic, so it carries no data-mark-type
		expect(node.tagName).toBe("MARK");
		expect(node.dataset.markType).toBeUndefined();
		expect(node.dataset.color).toBe("yellow");
		expect(node.style.getPropertyValue("background-color")).toBe(
			"var(--pen-highlight-color, yellow)",
		);
		expect(node.style.getPropertyValue("--pen-highlight-color")).toBe("");
		expect(node.style.color).toBe("");
	});

	it("RI7: a colour mark without a color prop paints nothing", () => {
		const highlight = createMarkedNode(
			"hello",
			{ highlight: {} },
			registry,
		) as HTMLElement;
		const textColor = createMarkedNode(
			"hello",
			{ textColor: { color: "" } },
			registry,
		) as HTMLElement;

		expect(highlight.tagName).toBe("MARK");
		expect(highlight.hasAttribute("data-color")).toBe(false);
		expect(highlight.style.cssText).toBe("");

		expect(textColor.dataset.markType).toBe("textColor");
		expect(textColor.hasAttribute("data-color")).toBe(false);
		expect(textColor.style.cssText).toBe("");
	});

	it("RI7: unknown marks stay on the default span with data-mark-type only", () => {
		const node = createMarkedNode(
			"hello",
			{ customMark: { color: "red", extra: "ignored" } },
			registry,
		) as HTMLElement;

		expect(node.tagName).toBe("SPAN");
		expect(node.dataset.markType).toBe("customMark");
		expect(node.hasAttribute("data-color")).toBe(false);
		expect(node.style.color).toBe("");
		expect(node.style.backgroundColor).toBe("");
		expect(node.style.cssText).toBe("");
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
