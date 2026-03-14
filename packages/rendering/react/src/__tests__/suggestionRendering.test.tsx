// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import { Pen } from "../primitives";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("@pen/react suggestion rendering", () => {
	it("renders suggestion marks with DOM attributes for diff styling and controls", async () => {
		const editor = createEditor({
			documentProfile: "flow",
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Hello world",
			},
			{
				type: "format-text",
				blockId,
				offset: 0,
				length: 5,
				marks: {
					suggestion: {
						id: "suggestion-insert-1",
						action: "insert",
						author: "ai",
						authorType: "ai",
						createdAt: 1,
					},
				},
			},
			{
				type: "format-text",
				blockId,
				offset: 6,
				length: 5,
				marks: {
					suggestion: {
						id: "suggestion-delete-1",
						action: "delete",
						author: "ai",
						authorType: "ai",
						createdAt: 1,
					},
				},
			},
		]);

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

		const insertSuggestion = container.querySelector(
			'[data-suggestion-id="suggestion-insert-1"]',
		);
		const deleteSuggestion = container.querySelector(
			'[data-suggestion-id="suggestion-delete-1"]',
		);

		expect(insertSuggestion).toBeTruthy();
		expect(insertSuggestion?.getAttribute("data-suggestion-action")).toBe(
			"insert",
		);
		expect(insertSuggestion?.classList.contains("pen-suggestion-insert")).toBe(
			true,
		);

		expect(deleteSuggestion).toBeTruthy();
		expect(deleteSuggestion?.getAttribute("data-suggestion-action")).toBe(
			"delete",
		);
		expect(deleteSuggestion?.classList.contains("pen-suggestion-delete")).toBe(
			true,
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
