// @vitest-environment jsdom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { createReducedMotionSignal } from "@input/pen-dom";
import { createEditor, fieldEditorHostFacet } from "@input/pen-core";
import { multiplayerExtension } from "@input/pen-multiplayer";
import { defaultPreset } from "@input/pen-preset-default";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("@input/pen-react caret overlay a11y", () => {
	it("AX7: editor caret overlay is aria-hidden and pointer-events none", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: defaultPreset({
				documentOps: false,
				deltaStream: false,
				undo: false,
			}),
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Editor.CaretOverlay />
					</Pen.Editor.Root>,
				);
			});

			const overlay = container.querySelector(
				"[data-pen-editor-caret-overlay]",
			);
			expect(overlay).not.toBeNull();
			expect(overlay?.getAttribute("aria-hidden")).toBe("true");
			expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("AX7: multiplayer caret overlay is aria-hidden and pointer-events none", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				multiplayerExtension({
					user: {
						id: "u1",
						name: "Ada",
					},
					autoConnect: false,
				}),
			],
		});
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Multiplayer.CaretOverlay />
					</Pen.Editor.Root>,
				);
			});

			const overlay = container.querySelector(
				"[data-pen-multiplayer-caret-overlay]",
			);
			expect(overlay).not.toBeNull();
			expect(overlay?.getAttribute("aria-hidden")).toBe("true");
			expect((overlay as HTMLElement).style.pointerEvents).toBe("none");
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});

	it("reaches createReducedMotionSignal through the @input/pen-dom exports map", () => {
		expect(typeof createReducedMotionSignal).toBe("function");
	});

	it("AX6: reduced motion keeps the caret solid after blink resume", async () => {
		stubMatchMedia(true);
		const { caret, cleanup } = await mountVisibleCaret();
		try {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
			});
			expect(caret()?.style.animation).toBe("none");
		} finally {
			await cleanup();
		}
	});

	it("AX6: without reduced motion the caret uses the host animation token after blink resume", async () => {
		stubMatchMedia(false);
		const { caret, cleanup } = await mountVisibleCaret();
		try {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
			});
			expect(caret()?.style.animation).toBe(
				"var(--pen-editor-caret-animation, none)",
			);
		} finally {
			await cleanup();
		}
	});
});

type MockMediaQueryList = {
	matches: boolean;
	addEventListener: (
		type: string,
		listener: (event: MediaQueryListEvent) => void,
	) => void;
	removeEventListener: (
		type: string,
		listener: (event: MediaQueryListEvent) => void,
	) => void;
};

function stubMatchMedia(matches: boolean): void {
	const mediaQueryList: MockMediaQueryList = {
		matches,
		addEventListener() {},
		removeEventListener() {},
	};
	vi.stubGlobal("matchMedia", () => mediaQueryList);
}

function getFieldEditor(editor: ReturnType<typeof createEditor>) {
	const fieldEditor = editor.facet(fieldEditorHostFacet) as {
		activateTextSelection(
			blockId: string,
			anchorOffset: number,
			focusOffset: number,
		): void;
	} | null;
	if (!fieldEditor) {
		throw new Error("Missing attached field editor");
	}
	return fieldEditor;
}

async function mountVisibleCaret(): Promise<{
	caret: () => HTMLElement | null;
	cleanup: () => Promise<void>;
}> {
	const editor = createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{
			type: "splice-text",
			blockId,
			from: 0,
			to: 0,
			insert: "Hello world",
		},
	]);

	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	await act(async () => {
		root.render(
			<Pen.Editor.Root editor={editor}>
				<Pen.Editor.Content />
				<Pen.Editor.CaretOverlay />
			</Pen.Editor.Root>,
		);
	});

	const fieldEditor = getFieldEditor(editor);
	const inlineElement = container.querySelector(
		"[data-pen-inline-content]",
	) as HTMLElement | null;
	if (!inlineElement) {
		throw new Error("Missing inline content element");
	}

	Object.defineProperty(inlineElement, "getBoundingClientRect", {
		configurable: true,
		value: () => new DOMRect(24, 32, 240, 24),
	});

	await act(async () => {
		fieldEditor.activateTextSelection(blockId, 2, 2);
		inlineElement.dispatchEvent(new Event("focusin", { bubbles: true }));
	});

	return {
		caret: () =>
			container.querySelector<HTMLElement>("[data-pen-editor-caret]"),
		cleanup: async () => {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		},
	};
}
