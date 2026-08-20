// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { searchExtension } from "@input/pen-search";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@input/pen-react search AX3", () => {
	it("AX3 names search input, results, and navigation", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [searchExtension()],
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				createElement(
					Pen.Search.Root,
					{ editor },
					createElement(Pen.Search.Input),
					createElement(Pen.Search.Results),
					createElement(Pen.Search.Previous),
					createElement(Pen.Search.Next),
				),
			);
		});

		const input = container.querySelector("[data-pen-search-input]");
		const results = container.querySelector("[data-pen-search-results]");
		const previous = container.querySelector(
			"[data-pen-search-navigation][data-option='previous']",
		);
		const next = container.querySelector(
			"[data-pen-search-navigation][data-option='next']",
		);

		expect(input?.getAttribute("aria-label")).toBe("Find in document");
		expect(results?.getAttribute("aria-label")).toBe("Search results");
		expect(previous?.getAttribute("aria-label")).toBe("Previous match");
		expect(next?.getAttribute("aria-label")).toBe("Next match");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("LOC1: host messages override search chrome labels", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [searchExtension()],
			messages: {
				"pen.search.input.label": "Im Dokument suchen",
				"pen.search.next": "Nächster Treffer",
			},
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				createElement(
					Pen.Search.Root,
					{ editor },
					createElement(Pen.Search.Input),
					createElement(Pen.Search.Next),
				),
			);
		});

		expect(
			container.querySelector("[data-pen-search-input]")?.getAttribute("aria-label"),
		).toBe("Im Dokument suchen");
		expect(
			container
				.querySelector("[data-pen-search-navigation][data-option='next']")
				?.getAttribute("aria-label"),
		).toBe("Nächster Treffer");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
