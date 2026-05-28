// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import {
	useSuggestionMenu,
	type SuggestionMenuController,
} from "../hooks/useSuggestionMenu";
import { Pen } from "../primitives/index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function waitForCondition(
	check: () => boolean,
	maxTicks = 20,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (check()) {
			return;
		}
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

function createSuggestionMenuEditor() {
	return createEditor({
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: false,
		}),
	});
}

function dispatchKey(key: string, target: EventTarget = document) {
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		}),
	);
}

function createRect(
	left: number,
	top: number,
	width: number,
	height: number,
): DOMRect {
	return {
		x: left,
		y: top,
		left,
		top,
		right: left + width,
		bottom: top + height,
		width,
		height,
		toJSON() {
			return {};
		},
	} as DOMRect;
}

function requireMenu<TItem>(
	menu: SuggestionMenuController<TItem> | null,
): SuggestionMenuController<TItem> {
	if (!menu) {
		throw new Error("Suggestion menu did not initialize");
	}
	return menu;
}

describe("@pen/react suggestion menu", () => {
	it("ignores stale async results after the query changes", async () => {
		const editor = createSuggestionMenuEditor();
		const blockId = editor.firstBlock()!.id;
		const requests: Array<{
			query: string;
			resolve: (items: readonly string[]) => void;
		}> = [];
		let menuSnapshot: SuggestionMenuController<string> | null = null;

		function Harness() {
			const menu = useSuggestionMenu<string>({
				editor,
				trigger: {
					char: ":",
					boundary: "whitespace",
					closingChar: ":",
					minQueryLength: 1,
					queryPattern: /^[a-z]+$/,
				},
				getItems({ query }) {
					return new Promise<readonly string[]>((resolve) => {
						requests.push({ query, resolve });
					});
				},
				onSelect: vi.fn(),
			});
			menuSnapshot = menu;

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			editor.apply([
				{ type: "insert-text", blockId, offset: 0, text: ":f" },
			]);
			editor.selectText(blockId, 2, 2);
		});

		await act(async () => {
			editor.apply([
				{ type: "insert-text", blockId, offset: 2, text: "i" },
			]);
			editor.selectText(blockId, 3, 3);
		});

		await waitForCondition(() =>
			requests.some((request) => request.query === "fi"),
		);
		const staleRequest = requests.find((request) => request.query === "f");
		const freshRequest = [...requests]
			.reverse()
			.find((request) => request.query === "fi");
		expect(staleRequest).toBeDefined();
		expect(freshRequest).toBeDefined();

		await act(async () => {
			staleRequest?.resolve(["fire"]);
			await Promise.resolve();
		});

		expect(requireMenu(menuSnapshot).items).toEqual([]);

		await act(async () => {
			freshRequest?.resolve(["fire", "first-quarter-moon"]);
			await waitForCondition(
				() => requireMenu(menuSnapshot).items.length === 2,
			);
		});

		expect(requireMenu(menuSnapshot).query).toBe("fi");
		expect(requireMenu(menuSnapshot).items).toEqual([
			"fire",
			"first-quarter-moon",
		]);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("dismisses instead of selecting when the target range is stale", async () => {
		const editor = createSuggestionMenuEditor();
		const blockId = editor.firstBlock()!.id;
		const onSelect = vi.fn();
		let menuSnapshot: SuggestionMenuController<string> | null = null;

		function Harness() {
			const menu = useSuggestionMenu<string>({
				editor,
				trigger: {
					char: "@",
					boundary: "whitespace",
					minQueryLength: 1,
				},
				getItems: () => ["Alex"],
				onSelect,
			});
			menuSnapshot = menu;

			return (
				<Pen.Editor.Root editor={editor}>
					<Pen.Editor.Content />
					<Pen.SuggestionMenu.Root controller={menu} />
				</Pen.Editor.Root>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(<Harness />);
		});

		await act(async () => {
			editor.apply([
				{ type: "insert-text", blockId, offset: 0, text: "@a" },
			]);
			editor.selectText(blockId, 2, 2);
			await waitForCondition(
				() => requireMenu(menuSnapshot).items.length === 1,
			);
		});

		await act(async () => {
			editor.selectText(blockId, 0, 0);
		});

		expect(requireMenu(menuSnapshot).confirm()).toBe(false);
		expect(onSelect).not.toHaveBeenCalled();
		expect(requireMenu(menuSnapshot).open).toBe(false);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

});
