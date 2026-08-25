// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { defaultSchema } from "@input/pen-schema-default";
import type { DiagnosticEvent } from "@input/pen-types";
import { EditorRoot } from "../primitives/editor/root";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestEditor() {
	return createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

const teardown: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (teardown.length > 0) {
		await teardown.pop()?.();
	}
});

describe("Pen.Editor.Root editor identity", () => {
	it("says so when it is handed a different editor than it mounted with", async () => {
		const firstEditor = createTestEditor();
		const secondEditor = createTestEditor();
		const diagnostics: DiagnosticEvent[] = [];
		secondEditor.on("diagnostic", (event) => {
			if (event.code === "editor-root-editor-replaced") {
				diagnostics.push(event);
			}
		});

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		teardown.push(async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			await firstEditor.destroy();
			await secondEditor.destroy();
		});

		await act(async () => {
			root.render(createElement(EditorRoot, { editor: firstEditor }));
		});
		expect(diagnostics).toEqual([]);

		await act(async () => {
			root.render(createElement(EditorRoot, { editor: secondEditor }));
		});

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]).toMatchObject({
			code: "editor-root-editor-replaced",
			level: "error",
			source: "rendering",
		});
		expect(diagnostics[0]?.remediation).toContain("key");
	});

	it("stays quiet while the editor stays the same", async () => {
		const editor = createTestEditor();
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		teardown.push(async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			await editor.destroy();
		});

		await act(async () => {
			root.render(createElement(EditorRoot, { editor }));
		});
		await act(async () => {
			root.render(createElement(EditorRoot, { editor, readonly: true }));
		});

		expect(
			diagnostics.filter(
				(event) => event.code === "editor-root-editor-replaced",
			),
		).toEqual([]);
	});
});
