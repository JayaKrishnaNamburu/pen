// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import { searchExtension } from "@input/pen-search";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@input/pen-react search primitives a11y", () => {
	it("AX3: find UI exposes a search landmark and labeled inputs", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [searchExtension()],
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				React.createElement(
					Pen.Search.Root,
					{ editor },
					React.createElement(Pen.Search.Input),
					React.createElement(Pen.Search.ReplaceInput),
					React.createElement(Pen.Search.Previous),
					React.createElement(Pen.Search.Next),
					React.createElement(Pen.Search.Replace),
					React.createElement(Pen.Search.ReplaceAll),
					React.createElement(Pen.Search.CaseSensitive),
					React.createElement(Pen.Search.WholeWord),
					React.createElement(Pen.Search.RegExp),
				),
			);
		});

		const searchRoot = container.querySelector("[data-pen-search-root]");
		expect(searchRoot?.getAttribute("role")).toBe("search");

		const input = container.querySelector(
			"[data-pen-search-input]",
		) as HTMLInputElement | null;
		expect(input?.getAttribute("role")).toBe("searchbox");
		expect(input?.getAttribute("aria-label")).toBe("Find in document");

		const replaceInput = container.querySelector(
			"[data-pen-search-replace-input]",
		) as HTMLInputElement | null;
		expect(replaceInput?.getAttribute("aria-label")).toBe("Replace with");

		expect(
			container
				.querySelector("[data-pen-search-navigation][data-option='previous']")
				?.getAttribute("aria-label"),
		).toBe("Previous match");
		expect(
			container
				.querySelector("[data-pen-search-navigation][data-option='next']")
				?.getAttribute("aria-label"),
		).toBe("Next match");
		expect(
			container
				.querySelector("[data-pen-search-replace-button][data-action='replace']")
				?.getAttribute("aria-label"),
		).toBe("Replace match");
		expect(
			container
				.querySelector(
					"[data-pen-search-replace-button][data-action='replace-all']",
				)
				?.getAttribute("aria-label"),
		).toBe("Replace all matches");
		expect(
			container
				.querySelector("[data-pen-search-toggle][data-option='case-sensitive']")
				?.getAttribute("aria-label"),
		).toBe("Toggle case-sensitive search");
		expect(
			container
				.querySelector("[data-pen-search-toggle][data-option='whole-word']")
				?.getAttribute("aria-label"),
		).toBe("Toggle whole-word search");
		expect(
			container
				.querySelector("[data-pen-search-toggle][data-option='regex']")
				?.getAttribute("aria-label"),
		).toBe("Toggle regular expression search");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
