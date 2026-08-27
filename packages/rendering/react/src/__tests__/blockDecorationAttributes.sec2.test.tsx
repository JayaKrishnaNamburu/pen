// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import {
	createDecorationSet,
	createEditor,
	decorationsFacet,
	defineExtension,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Shaped after the remote block-selection decoration `@input/pen-multiplayer`
 * used to emit: a wrapping block decoration whose attribute bag is DOM
 * attributes, so `style` is a CSS string rather than a React style object.
 */
function peerSelectionExtension(isVisible: () => boolean) {
	return defineExtension({
		name: "test-peer-block-selection",
		facets: [
			decorationsFacet.of((_state, editor) => {
				const blockId = editor.firstBlock()?.id;
				if (!blockId || !isVisible()) {
					return createDecorationSet([]);
				}
				return createDecorationSet([
					{
						type: "block",
						blockId,
						position: "wrap",
						attributes: {
							class: "peer-block-selection",
							"data-user-name": "Babbage",
							style: "--peer-color: #d946ef",
							onclick: "alert(1)",
							dangerouslySetInnerHTML: "<b>pwned</b>",
						},
					},
				]);
			}),
		],
	});
}

function getBlockHost(container: HTMLElement, blockId: string): HTMLElement {
	const host = container.querySelector(
		`[data-pen-editor-block][data-block-id="${blockId}"]`,
	);
	if (!(host instanceof HTMLElement)) {
		throw new Error(`Missing block host for ${blockId}`);
	}
	return host;
}

describe("@input/pen-react SEC2 block decoration attributes", () => {
	it("SEC2: drops style, on*, and dangerouslySetInnerHTML from a block decoration that arrives after mount", async () => {
		let isVisible = false;
		const uncaught: unknown[] = [];
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [peerSelectionExtension(() => isVisible)],
		});
		const blockId = editor.firstBlock()!.id;

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root: Root = createRoot(container, {
			onUncaughtError: (error) => uncaught.push(error),
		});

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>,
			);
		});

		expect(getBlockHost(container, blockId).style.unicodeBidi).toBe(
			"isolate",
		);

		await act(async () => {
			isVisible = true;
			editor.apply(
				[{ type: "splice-text", blockId, from: 0, to: 0, insert: "hi" }],
				{ origin: "collaborator" },
			);
		});

		const host = getBlockHost(container, blockId);
		expect(uncaught).toEqual([]);
		// RI1 isolation survives; the decoration's CSS string never lands
		expect(host.style.unicodeBidi).toBe("isolate");
		expect(host.getAttribute("style")).not.toContain("--peer-color");
		expect(host.hasAttribute("onclick")).toBe(false);
		expect(host.innerHTML).not.toContain("pwned");
		// the rest of the bag still reaches the host
		expect(host.className).toContain("peer-block-selection");
		expect(host.getAttribute("data-user-name")).toBe("Babbage");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
