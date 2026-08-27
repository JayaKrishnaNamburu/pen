// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestEditor() {
	return createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function dispatchKey(target: EventTarget, key: string): KeyboardEvent {
	const event = new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
	});
	target.dispatchEvent(event);
	return event;
}

function toolbarItems(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			"[data-pen-toolbar-button], [data-pen-toolbar-toggle], [data-pen-toolbar-select]",
		),
	);
}

async function renderToolbar() {
	const editor = createTestEditor();
	const blockId = editor.firstBlock()!.id;
	editor.selectText(blockId, 0, 0);

	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			createElement(
				Pen.Editor.Root,
				{ editor },
				createElement(
					Pen.Toolbar.Root,
					null,
					createElement(Pen.Toolbar.Button, null, "Bold"),
					createElement(
						Pen.Toolbar.Toggle,
						{ format: "italic" },
						"Italic",
					),
					createElement(
						Pen.Toolbar.Button,
						{ disabled: true },
						"Strike",
					),
					createElement(Pen.Toolbar.Button, null, "Link"),
				),
			),
		);
	});

	const fixture = { container, editor, root };
	fixtures.push(fixture);
	return fixture;
}

const fixtures: Array<{
	container: HTMLElement;
	editor: ReturnType<typeof createTestEditor>;
	root: ReturnType<typeof createRoot>;
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

describe("@input/pen-react toolbar AX3", () => {
	it("AX3: detached surface uses role=toolbar and roving tabindex without stealing focus", async () => {
		const editorSurface = document.createElement("textarea");
		document.body.appendChild(editorSurface);
		editorSurface.focus();
		expect(document.activeElement).toBe(editorSurface);

		const fixture = await renderToolbar();
		const toolbar = fixture.container.querySelector("[data-pen-toolbar]");
		const items = toolbarItems(fixture.container);
		const enabled = items.filter(
			(item) => item.getAttribute("aria-disabled") !== "true",
		);
		const disabled = items.filter(
			(item) => item.getAttribute("aria-disabled") === "true",
		);

		expect(toolbar?.getAttribute("role")).toBe("toolbar");
		expect(toolbar?.getAttribute("aria-orientation")).toBe("horizontal");
		expect(enabled.length).toBe(3);
		expect(disabled.length).toBe(1);
		expect(enabled[0]?.tabIndex).toBe(0);
		expect(
			enabled.every(
				(item, index) => item.tabIndex === (index === 0 ? 0 : -1),
			),
		).toBe(true);
		expect(disabled[0]?.tabIndex).toBe(-1);
		expect(document.activeElement).toBe(editorSurface);

		editorSurface.remove();
	});

	it("AX3: arrow keys move roving tabindex within the toolbar", async () => {
		const fixture = await renderToolbar();
		const items = toolbarItems(fixture.container);
		const enabled = items.filter(
			(item) => item.getAttribute("aria-disabled") !== "true",
		);
		expect(enabled).toHaveLength(3);

		await act(async () => {
			enabled[0]?.focus();
		});
		expect(document.activeElement).toBe(enabled[0]);

		await act(async () => {
			dispatchKey(enabled[0]!, "ArrowRight");
		});
		expect(document.activeElement).toBe(enabled[1]);
		expect(enabled[0]?.tabIndex).toBe(-1);
		expect(enabled[1]?.tabIndex).toBe(0);

		await act(async () => {
			dispatchKey(enabled[1]!, "ArrowRight");
		});
		expect(document.activeElement).toBe(enabled[2]);
		expect(enabled[2]?.tabIndex).toBe(0);

		await act(async () => {
			dispatchKey(enabled[2]!, "ArrowLeft");
		});
		expect(document.activeElement).toBe(enabled[1]);

		await act(async () => {
			dispatchKey(enabled[1]!, "End");
		});
		expect(document.activeElement).toBe(enabled[2]);
		expect(enabled[2]?.tabIndex).toBe(0);

		await act(async () => {
			dispatchKey(enabled[2]!, "Home");
		});
		expect(document.activeElement).toBe(enabled[0]);
		expect(enabled[0]?.tabIndex).toBe(0);
	});

	it("AX3: Escape restores focus to the editor", async () => {
		const fixture = await renderToolbar();
		const editorRoot = fixture.container.querySelector(
			"[data-pen-editor-root]",
		) as HTMLElement;
		const items = toolbarItems(fixture.container);
		const first = items[0]!;

		await act(async () => {
			editorRoot.focus();
		});
		expect(document.activeElement).toBe(editorRoot);

		await act(async () => {
			first.focus();
		});
		expect(document.activeElement).toBe(first);

		let event!: KeyboardEvent;
		await act(async () => {
			event = dispatchKey(first, "Escape");
		});

		expect(event.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(editorRoot);
	});
});
