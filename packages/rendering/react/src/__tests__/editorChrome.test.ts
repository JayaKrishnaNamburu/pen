// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { createEditor as createCoreEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import { EditorRoot } from "../primitives/editor/root";
import { defaultSchema } from "@input/pen-schema";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createEditor() {
	return createCoreEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

async function renderRoot(
	editor: ReturnType<typeof createEditor>,
	chrome?: boolean,
): Promise<{ container: HTMLDivElement; root: Root }> {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const reactRoot = createRoot(container);

	await act(async () => {
		reactRoot.render(
			React.createElement(EditorRoot, { editor, chrome }),
		);
	});

	return { container, root: reactRoot };
}

async function cleanupEditor(
	editor: ReturnType<typeof createEditor>,
	root: Root,
	container: HTMLElement,
): Promise<void> {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	editor.destroy();
}

describe("HOST6: EditorRoot chrome", () => {
	afterEach(() => {
		document.getElementById("pen-editor-chrome")?.remove();
	});

	it("adopts editor chrome by default", async () => {
		const editor = createEditor();
		const { container, root } = await renderRoot(editor);

		expect(document.getElementById("pen-editor-chrome")).toBeInstanceOf(
			HTMLStyleElement,
		);

		await cleanupEditor(editor, root, container);
		expect(document.getElementById("pen-editor-chrome")).toBeNull();
	});

	it("chrome false does not adopt the stylesheet", async () => {
		const editor = createEditor();
		const { container, root } = await renderRoot(editor, false);

		expect(document.getElementById("pen-editor-chrome")).toBeNull();

		await cleanupEditor(editor, root, container);
	});
});
