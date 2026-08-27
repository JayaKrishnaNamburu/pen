// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor as createCoreEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen";
import {
	getMultiplayerController,
	multiplayerExtension,
} from "@input/pen-multiplayer";
import { defaultSchema } from "@input/pen-schema";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TABLE_ID = "t-presence";
const PEER_ID = 77;

/** Seeded grid is 2x2, so (0,1) and (1,1) sit outside the range below. */
function createTableEditor() {
	const editor = createCoreEditor({
		schema: defaultSchema,
		extensions: [
			multiplayerExtension({
				user: { id: "u1", name: "Ada" },
				autoConnect: false,
			}),
		],
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});

	editor.apply([
		{
			type: "insert-block",
			blockId: TABLE_ID,
			blockType: "table",
			props: { hasHeaderRow: false },
			position: "last",
		},
	]);

	return editor;
}

function sendRemoteCellSelection(
	editor: ReturnType<typeof createTableEditor>,
	anchor: { row: number; col: number },
	head: { row: number; col: number },
) {
	const controller = getMultiplayerController(editor) as {
		handleAwarenessChange(
			states: Map<number, Record<string, unknown>>,
		): void;
	} | null;

	controller?.handleAwarenessChange(
		new Map<number, Record<string, unknown>>([
			[
				PEER_ID,
				{
					user: { id: "u2", name: "Babbage", color: "#abc123" },
					selection: {
						kind: "cell",
						blockId: TABLE_ID,
						anchor,
						head,
						clock: 12,
					},
				},
			],
		]),
	);
}

function queryCell(container: HTMLElement, row: number, col: number) {
	return container.querySelector(
		`[data-block-id="${TABLE_ID}"] [data-pen-table-cell][data-cell-row="${row}"][data-cell-col="${col}"]`,
	) as HTMLElement | null;
}

describe("@input/pen-react table rendering: remote cell presence", () => {
	it("rings the peer's cells and names only the head cell", async () => {
		const editor = createTableEditor();
		sendRemoteCellSelection(editor, { row: 0, col: 0 }, { row: 1, col: 0 });

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		const head = queryCell(container, 1, 0);
		expect(head?.hasAttribute("data-pen-multiplayer-cell-selection")).toBe(
			true,
		);
		expect(head?.hasAttribute("data-pen-multiplayer-cell-head")).toBe(true);
		expect(head?.getAttribute("data-user-name")).toBe("Babbage");
		expect(head?.getAttribute("data-multiplayer-client-id")).toBe(
			String(PEER_ID),
		);
		// the caret overlay's token, set as a prop because a decoration cannot
		// carry colour under SEC2
		expect(head?.style.getPropertyValue("--pen-peer-color")).toBe(
			"#abc123",
		);

		const anchorCell = queryCell(container, 0, 0);
		expect(
			anchorCell?.hasAttribute("data-pen-multiplayer-cell-selection"),
		).toBe(true);
		expect(anchorCell?.hasAttribute("data-pen-multiplayer-cell-head")).toBe(
			false,
		);

		const outside = queryCell(container, 1, 1);
		expect(
			outside?.hasAttribute("data-pen-multiplayer-cell-selection"),
		).toBe(false);
		expect(outside?.hasAttribute("data-user-name")).toBe(false);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("leaves cells bare when no peer is in the table", async () => {
		const editor = createTableEditor();

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		expect(
			container.querySelector("[data-pen-multiplayer-cell-selection]"),
		).toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
