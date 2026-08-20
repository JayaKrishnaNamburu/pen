// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import { multiplayerExtension } from "@input/pen-multiplayer";
import { defaultPreset } from "@input/pen-preset-default";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@input/pen-react caret overlay a11y", () => {
	it("AX7: editor caret overlay is aria-hidden and pointer-events none", async () => {
		const editor = createEditor({
			schema: defaultSchema, preset: defaultPreset({
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
			schema: defaultSchema,extensions: [
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
});
