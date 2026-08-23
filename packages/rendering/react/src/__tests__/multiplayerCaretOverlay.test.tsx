// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@input/pen-core";
import {
	getMultiplayerController,
	multiplayerExtension,
} from "@input/pen-multiplayer";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@input/pen-react multiplayer caret overlay", () => {
	it("places the remote caret on the GeometryReader rect", async () => {
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
		const controller = getMultiplayerController(editor) as {
			handleAwarenessChange(
				states: Map<number, Record<string, unknown>>,
			): void;
		} | null;
		const blockId = editor.firstBlock()!.id;
		editor.apply([{ type: "insert-text", blockId, offset: 0, text: "Hi" }]);

		publishRemoteCursor(controller, editor.clientId, encodeCursorAnchor(editor, blockId, 1), 1);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		try {
			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Editor.Content />
					</Pen.Editor.Root>,
				);
			});

			const inlineElement = container.querySelector(
				"[data-pen-inline-content]",
			) as HTMLElement | null;
			expect(inlineElement).not.toBeNull();
			if (!inlineElement) {
				throw new Error("Missing inline content element");
			}

			Object.defineProperty(inlineElement, "getBoundingClientRect", {
				configurable: true,
				value: () => new DOMRect(24, 32, 240, 24),
			});

			await act(async () => {
				root.render(
					<Pen.Editor.Root editor={editor}>
						<Pen.Editor.Content />
						<Pen.Multiplayer.CaretOverlay />
					</Pen.Editor.Root>,
				);
			});

			const caret = container.querySelector(
				"[data-pen-multiplayer-caret]:not([data-pen-multiplayer-caret-label])",
			) as HTMLElement | null;
			const label = container.querySelector(
				"[data-pen-multiplayer-caret-label]",
			) as HTMLElement | null;
			expect(caret).not.toBeNull();
			expect(label?.textContent).toBe("Babbage");
			expect(caret?.style.left).toBe("24px");
			expect(caret?.style.top).toBe("32px");
			expect(caret?.style.height).toBe("24px");
			expect(label?.style.left).toBe("24px");
			expect(label?.style.top).toBe("24px");
		} finally {
			await act(async () => {
				root.unmount();
			});
			container.remove();
			editor.destroy();
		}
	});
});

function publishRemoteCursor(
	controller: {
		handleAwarenessChange(
			states: Map<number, Record<string, unknown>>,
		): void;
	} | null,
	localClientId: number,
	anchor: string,
	clock: number,
): void {
	controller?.handleAwarenessChange(
		new Map<number, Record<string, unknown>>([
			[
				localClientId,
				{
					user: {
						id: "u1",
						name: "Ada",
					},
				},
			],
			[
				77,
				{
					user: {
						id: "u2",
						name: "Babbage",
						color: "#abc123",
					},
					cursor: {
						anchor,
						clock,
					},
				},
			],
		]),
	);
}

function encodeCursorAnchor(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
	offset: number,
): string {
	const minted = editor.anchors.create({ blockId, offset }, 1);
	if (minted === null) {
		throw new Error("Could not mint a cursor anchor");
	}
	return editor.anchors.serialize(minted);
}
