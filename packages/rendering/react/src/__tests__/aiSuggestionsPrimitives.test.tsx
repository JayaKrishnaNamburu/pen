// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import {
	aiSuggestionsExtension,
	getAISuggestionsController,
} from "@pen/ai-suggestions";
import { Pen } from "../index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

async function flush(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

async function waitForCondition(
	check: () => boolean,
	maxTicks = 20,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (check()) {
			return;
		}
		await flush();
	}
}

describe("Pen.AISuggestions primitives", () => {
	it("opens the popover from a marked suggestion and applies it", async () => {
		const editor = createEditor({
			extensions: [
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					analyzer: {
						async analyze() {
							return {
								candidates: [
									{
										kind: "spelling",
										title: "Spelling",
										originalText: "Ths",
										replacementText: "This",
										reason: "Fix the misspelling.",
										confidence: 0.99,
									},
								],
							};
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "Ths sentence works.",
				},
			],
			{ origin: "user" },
		);

		await waitForCondition(
			() =>
				(getAISuggestionsController(editor)?.getState().suggestions.length ?? 0) > 0,
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.AISuggestions.Root editor={editor}>
						<Pen.AISuggestions.Popover />
					</Pen.AISuggestions.Root>
				</Pen.Editor.Root>,
			);
			await flush();
		});

		const suggestion =
			getAISuggestionsController(editor)?.getState().suggestions[0] ?? null;
		expect(suggestion).toBeTruthy();

		const anchor = document.createElement("button");
		anchor.setAttribute("data-ai-suggestion-id", suggestion!.id);
		anchor.getBoundingClientRect = () =>
			({
				top: 100,
				left: 160,
				width: 48,
				height: 20,
				right: 208,
				bottom: 120,
				x: 160,
				y: 100,
				toJSON() {
					return this;
				},
			}) as DOMRect;
		const aiRoot = container.querySelector(
			"[data-pen-ai-suggestions-root]",
		) as HTMLElement | null;
		expect(aiRoot).toBeTruthy();
		aiRoot?.appendChild(anchor);
		expect(anchor).toBeTruthy();

		await act(async () => {
			anchor?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
				}),
			);
			await flush();
		});

		const popover = document.querySelector(
			"[data-pen-ai-suggestions-popover]",
		) as HTMLElement | null;
		expect(popover).toBeTruthy();
		expect(popover?.textContent).toContain("This");
		expect(popover?.textContent).toContain("Fix the misspelling.");

		const applyButton = [...popover!.querySelectorAll("button")].find(
			(button) => button.textContent?.includes("Apply"),
		) as HTMLButtonElement | undefined;
		expect(applyButton).toBeTruthy();

		await act(async () => {
			applyButton?.dispatchEvent(
				new MouseEvent("click", {
					bubbles: true,
					cancelable: true,
				}),
			);
			await flush();
		});

		expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
			"This sentence works.",
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
