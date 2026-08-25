// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
	createEditor,
	defineExtension,
	ariaReadOnlyFacet,
	fieldEditorHostFacet,
} from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { defaultSchema } from "@input/pen-schema-default";
import type { FieldEditorImpl } from "@input/pen-dom";
import type { Editor } from "@input/pen-types";
import { PenEditor } from "../penEditor";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestEditor(ariaReadOnlyFacetValue?: boolean) {
	return createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
		extensions:
			ariaReadOnlyFacetValue === undefined
				? []
				: [
						defineExtension({
							name: "aria-readonly-split",
							facets: [ariaReadOnlyFacet.of(ariaReadOnlyFacetValue)],
						}),
					],
	});
}

function insertHello(editor: Editor): string {
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
		],
		{ origin: "user" },
	);
	return editor
		.getBlock(blockId)!
		.textContent()
		.replace(/\u200B/g, "");
}

const fixtures: Array<{
	container: HTMLElement;
	editor: Editor;
	root: Root;
}> = [];

afterEach(async () => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		await act(async () => {
			fixture.root.unmount();
		});
		fixture.container.remove();
		fixture.editor.destroy();
	}
});

async function renderEditor(
	editor: Editor,
	readonly?: boolean,
): Promise<{ container: HTMLElement; host: HTMLElement }> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	fixtures.push({ container, editor, root });

	await act(async () => {
		root.render(
			React.createElement(PenEditor, {
				editor,
				...(readonly === undefined ? {} : { readonly }),
			}),
		);
	});

	const host = container.querySelector("[data-pen-editor-root]");
	if (!(host instanceof HTMLElement)) {
		throw new Error("Missing editor root host");
	}
	return { container, host };
}

function fieldEditor(editor: Editor): FieldEditorImpl | null {
	return (editor.facet(fieldEditorHostFacet) as FieldEditorImpl | null) ?? null;
}

async function pointerActivateInline(container: HTMLElement): Promise<void> {
	const inline = container.querySelector("[data-pen-inline-content]");
	expect(inline).toBeInstanceOf(HTMLElement);
	await act(async () => {
		inline?.dispatchEvent(
			new MouseEvent("mousedown", {
				bubbles: true,
				cancelable: true,
				button: 0,
			}),
		);
		inline?.dispatchEvent(
			new MouseEvent("mouseup", {
				bubbles: true,
				cancelable: true,
				button: 0,
			}),
		);
		inline?.dispatchEvent(
			new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
				button: 0,
			}),
		);
	});
}

describe("React pen.ariaReadOnly vs readonly prop", () => {
	it("ariaReadOnly facet announces aria-readonly and still accepts typing", async () => {
		const editor = createTestEditor(true);
		const { container, host } = await renderEditor(editor);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
		expect(host.getAttribute("aria-readonly")).toBe("true");
		expect(host.hasAttribute("data-readonly")).toBe(false);

		await pointerActivateInline(container);
		expect(fieldEditor(editor)?.isEditing).toBe(true);
		let text = "";
		await act(async () => {
			text = insertHello(editor);
		});
		expect(text).toBe("hello");
	});

	it("readonly prop announces aria-readonly and declines typing", async () => {
		const editor = createTestEditor();
		const { container, host } = await renderEditor(editor, true);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(false);
		expect(host.getAttribute("aria-readonly")).toBe("true");
		expect(host.getAttribute("data-readonly")).toBe("");

		await pointerActivateInline(container);
		expect(fieldEditor(editor)?.isEditing).toBe(false);
		let text = "";
		await act(async () => {
			text = insertHello(editor);
		});
		expect(text).toBe("hello");
	});

	it("ariaReadOnly facet plus readonly prop: prop wins for typing, both set aria-readonly", async () => {
		const editor = createTestEditor(true);
		const { container, host } = await renderEditor(editor, true);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
		expect(host.getAttribute("aria-readonly")).toBe("true");
		expect(host.getAttribute("data-readonly")).toBe("");

		await pointerActivateInline(container);
		expect(fieldEditor(editor)?.isEditing).toBe(false);
		let text = "";
		await act(async () => {
			text = insertHello(editor);
		});
		expect(text).toBe("hello");
	});
});
