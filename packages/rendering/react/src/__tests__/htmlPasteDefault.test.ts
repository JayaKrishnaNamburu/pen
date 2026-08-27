// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import {
	clipboardFacet,
	createEditor as createCoreEditor,
} from "@input/pen-core";
import { htmlImporter } from "@input/pen-interop/html";
import { defaultPreset } from "@input/pen";
import { EditorRoot } from "../primitives/editor/root";
import { defaultSchema } from "@input/pen-schema";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("HTML paste default lives on the preset, not react", () => {
	it("defaultPreset() + EditorRoot without importers keeps the HTML importer", async () => {
		const editor = createCoreEditor({
			preset: defaultPreset({
				tools: false,
				deltaStream: false,
				undo: false,
				shortcuts: false,
			}),
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(React.createElement(EditorRoot, { editor }));
		});

		expect(editor.facet(clipboardFacet)).toMatchObject({
			html: htmlImporter,
		});

		await act(async () => {
			root.unmount();
		});
		container.remove();
		await editor.destroy();
	});

	it("a host markdown-only importers prop keeps the preset HTML importer", async () => {
		const editor = createCoreEditor({
			preset: defaultPreset({
				tools: false,
				deltaStream: false,
				undo: false,
				shortcuts: false,
			}),
		});
		const markdown = {
			name: "markdown",
			mimeType: "text/markdown",
			parse: () => [],
			import: () => undefined,
		};
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				React.createElement(EditorRoot, {
					editor,
					importers: { markdown },
				}),
			);
		});

		expect(editor.facet(clipboardFacet)).toMatchObject({
			html: htmlImporter,
			markdown,
		});

		await act(async () => {
			root.unmount();
		});
		expect(editor.facet(clipboardFacet)).toMatchObject({
			html: htmlImporter,
		});
		container.remove();
		await editor.destroy();
	});

	it("bare createEditor + EditorRoot does not install an HTML importer", async () => {
		const editor = createCoreEditor({ schema: defaultSchema });
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(React.createElement(EditorRoot, { editor }));
		});

		const value = editor.facet(clipboardFacet);
		expect(value == null || Array.isArray(value)).toBe(true);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		await editor.destroy();
	});
});
