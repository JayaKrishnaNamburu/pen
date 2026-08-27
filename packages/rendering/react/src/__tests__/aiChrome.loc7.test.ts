// @vitest-environment jsdom

import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
	createEditor,
	createPseudoLocaleCatalog,
	isPseudoLocaleText,
} from "@input/pen-core";
import { aiExtension, getAIController } from "@input/pen-ai";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "@input/pen-ai/stream";
import { toolsExtension } from "@input/pen-tools";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AI chrome pseudo-locale (LOC1, LOC7)", () => {
	it("LOC7: command menu and change-list chrome wrap through the pseudo catalog", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				toolsExtension(),
				aiExtension(),
			],
			messages: createPseudoLocaleCatalog(),
		});
		const controller = getAIController(editor);
		if (!controller) {
			throw new Error("AI controller was not registered");
		}
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" }],
			{ origin: "user" },
		);
		editor.selectText(blockId, 0, 5);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				createElement(
					Pen.Editor.Root,
					{ editor },
					createElement(
						Pen.AI.Root,
						null,
						createElement(
							Pen.AI.CommandMenu,
							null,
							createElement(Pen.AI.CommandInput),
							createElement(Pen.AI.CommandList),
						),
						createElement(Pen.AI.ChangeList),
					),
				),
			);
		});
		await act(async () => {
			controller.openCommandMenu();
		});

		const placeholder = container
			.querySelector("[data-pen-ai-command-input]")
			?.getAttribute("placeholder");
		const listLabel = container
			.querySelector("[data-pen-ai-command-list]")
			?.getAttribute("aria-label");
		const labels = [
			...container.querySelectorAll("[data-pen-ai-command-item]"),
		].map((item) => item.textContent ?? "");
		const emptyState = container.querySelector(
			"[data-pen-ai-change-list]",
		)?.textContent;

		expect(placeholder && isPseudoLocaleText(placeholder)).toBe(true);
		expect(placeholder).not.toBe("Search AI commands");
		expect(listLabel && isPseudoLocaleText(listLabel)).toBe(true);
		expect(listLabel).not.toBe("AI command menu");
		expect(labels.some((label) => isPseudoLocaleText(label))).toBe(true);
		expect(labels).not.toContain("Rewrite");
		expect(emptyState && isPseudoLocaleText(emptyState.trim())).toBe(true);
		expect(emptyState?.trim()).not.toBe("No pending changes.");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
