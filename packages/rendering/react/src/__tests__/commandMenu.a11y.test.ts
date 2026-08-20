// @vitest-environment jsdom

import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@input/pen-core";
import { aiExtension, getAIController, type AICommandBinding } from "@input/pen-ai";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TEST_COMMANDS: AICommandBinding[] = [
	{ id: "test:alpha", label: "Alpha", prompt: "alpha" },
	{ id: "test:beta", label: "Beta", prompt: "beta" },
	{ id: "test:gamma", label: "Gamma", prompt: "gamma" },
];

function dispatchKey(target: EventTarget, key: string): void {
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		}),
	);
}

function setInputValue(input: HTMLInputElement, value: string): void {
	const setter = Object.getOwnPropertyDescriptor(
		HTMLInputElement.prototype,
		"value",
	)?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderCommandMenu(): Promise<{
	container: HTMLDivElement;
	root: Root;
	editor: ReturnType<typeof createEditor>;
	controller: NonNullable<ReturnType<typeof getAIController>>;
}> {
	const editor = createEditor({
		schema: defaultSchema,extensions: [aiExtension({ commands: TEST_COMMANDS })],
	});
	const controller = getAIController(editor);
	if (!controller) {
		throw new Error("AI controller was not registered");
	}

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
				),
			),
		);
	});

	await act(async () => {
		controller.openCommandMenu();
	});

	return { container, root, editor, controller };
}

async function cleanup(
	root: Root,
	container: HTMLElement,
	editor: ReturnType<typeof createEditor>,
): Promise<void> {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	editor.destroy();
}

describe("@input/pen-react AI command menu AX3", () => {
	it("AX3: uses role=menu/listbox and aria-activedescendant when a list exists", async () => {
		const { container, root, editor } = await renderCommandMenu();

		const menu = container.querySelector("[data-pen-ai-command-menu]");
		const list = container.querySelector("[data-pen-ai-command-list]");
		const input = container.querySelector("[data-pen-ai-command-input]");
		const items = container.querySelectorAll("[data-pen-ai-command-item]");

		expect(menu?.getAttribute("role")).toBe("menu");
		expect(list?.getAttribute("role")).toBe("listbox");
		expect(items.length).toBeGreaterThan(0);
		expect(items[0]?.getAttribute("role")).toBe("option");
		expect(items[0]?.id).toBeTruthy();
		expect(list?.getAttribute("aria-activedescendant")).toBe(items[0]?.id);
		expect(menu?.getAttribute("aria-activedescendant")).toBe(items[0]?.id);
		expect(input?.getAttribute("aria-activedescendant")).toBe(items[0]?.id);
		expect(input?.getAttribute("aria-controls")).toBe(list?.id);
		expect(input?.getAttribute("aria-expanded")).toBe("true");
		expect(items[0]?.getAttribute("aria-selected")).toBe("true");

		await cleanup(root, container, editor);
	});

	it("AX3: omits aria-activedescendant when the command list is empty", async () => {
		const { container, root, editor } = await renderCommandMenu();
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);
		expect(input).toBeTruthy();

		await act(async () => {
			setInputValue(input!, "zzzz-no-match");
		});

		const menu = container.querySelector("[data-pen-ai-command-menu]");
		const list = container.querySelector("[data-pen-ai-command-list]");
		const items = container.querySelectorAll("[data-pen-ai-command-item]");

		expect(items.length).toBe(0);
		expect(list?.hasAttribute("aria-activedescendant")).toBe(false);
		expect(menu?.hasAttribute("aria-activedescendant")).toBe(false);
		expect(input?.hasAttribute("aria-activedescendant")).toBe(false);

		await cleanup(root, container, editor);
	});

	it("AX3: arrow keys move aria-activedescendant without leaving the input", async () => {
		const { container, root, editor } = await renderCommandMenu();
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);
		const list = container.querySelector("[data-pen-ai-command-list]");
		const items = container.querySelectorAll<HTMLElement>(
			"[data-pen-ai-command-item]",
		);
		expect(input).toBeTruthy();
		expect(items.length).toBeGreaterThan(2);

		await act(async () => {
			input?.focus();
		});
		expect(document.activeElement).toBe(input);

		await act(async () => {
			dispatchKey(input!, "ArrowDown");
		});
		expect(document.activeElement).toBe(input);
		expect(list?.getAttribute("aria-activedescendant")).toBe(items[1]?.id);
		expect(input?.getAttribute("aria-activedescendant")).toBe(items[1]?.id);
		expect(items[1]?.getAttribute("aria-selected")).toBe("true");
		expect(items[0]?.getAttribute("aria-selected")).toBe("false");

		await act(async () => {
			dispatchKey(input!, "ArrowUp");
		});
		expect(document.activeElement).toBe(input);
		expect(list?.getAttribute("aria-activedescendant")).toBe(items[0]?.id);

		await act(async () => {
			dispatchKey(input!, "End");
		});
		expect(list?.getAttribute("aria-activedescendant")).toBe(
			items[items.length - 1]?.id,
		);

		await act(async () => {
			dispatchKey(input!, "Home");
		});
		expect(list?.getAttribute("aria-activedescendant")).toBe(items[0]?.id);
		expect(document.activeElement).toBe(input);

		await cleanup(root, container, editor);
	});

	it("AX3: Enter runs the active command and closes the menu", async () => {
		const { container, root, editor, controller } = await renderCommandMenu();
		const runCommand = vi
			.spyOn(controller, "runCommand")
			.mockResolvedValue({} as never);
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);
		const items = container.querySelectorAll("[data-pen-ai-command-item]");
		const firstCommandId = items[0]?.getAttribute("data-command-id");
		expect(input).toBeTruthy();
		expect(firstCommandId).toBeTruthy();

		await act(async () => {
			input?.focus();
			dispatchKey(input!, "Enter");
		});

		expect(runCommand).toHaveBeenCalledWith(firstCommandId);
		expect(controller.getState().commandMenuOpen).toBe(false);
		expect(
			container
				.querySelector("[data-pen-ai-command-menu]")
				?.hasAttribute("hidden"),
		).toBe(true);

		await cleanup(root, container, editor);
	});

	it("LOC1: default command menu shows catalog labels and chrome", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension()],
		});
		const controller = getAIController(editor);
		if (!controller) {
			throw new Error("AI controller was not registered");
		}
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
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
					),
				),
			);
		});
		await act(async () => {
			controller.openCommandMenu();
		});

		const input = container.querySelector("[data-pen-ai-command-input]");
		const list = container.querySelector("[data-pen-ai-command-list]");
		const labels = [
			...container.querySelectorAll("[data-pen-ai-command-item]"),
		].map((item) => item.textContent);

		expect(input?.getAttribute("placeholder")).toBe("Search AI commands");
		expect(list?.getAttribute("aria-label")).toBe("AI command menu");
		expect(labels).toContain("Rewrite");

		await cleanup(root, container, editor);
	});

	it("LOC1: host messages override command-menu chrome and command labels", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension()],
			messages: {
				"pen.ai.commandMenu.placeholder": "KI-Befehle suchen",
				"pen.ai.commandMenu.label": "KI-Befehlmenü",
				"pen.ai.command.rewrite": "Umschreiben",
			},
		});
		const controller = getAIController(editor);
		if (!controller) {
			throw new Error("AI controller was not registered");
		}
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
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
					),
				),
			);
		});
		await act(async () => {
			controller.openCommandMenu();
		});

		const input = container.querySelector("[data-pen-ai-command-input]");
		const list = container.querySelector("[data-pen-ai-command-list]");
		const labels = [
			...container.querySelectorAll("[data-pen-ai-command-item]"),
		].map((item) => item.textContent);

		expect(input?.getAttribute("placeholder")).toBe("KI-Befehle suchen");
		expect(list?.getAttribute("aria-label")).toBe("KI-Befehlmenü");
		expect(labels).toContain("Umschreiben");

		await cleanup(root, container, editor);
	});

	it("AX3: Escape closes the command menu", async () => {
		const { container, root, editor, controller } = await renderCommandMenu();
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);
		expect(input).toBeTruthy();
		expect(controller.getState().commandMenuOpen).toBe(true);

		await act(async () => {
			input?.focus();
			dispatchKey(input!, "Escape");
		});

		expect(controller.getState().commandMenuOpen).toBe(false);
		expect(
			container
				.querySelector("[data-pen-ai-command-menu]")
				?.hasAttribute("hidden"),
		).toBe(true);

		await cleanup(root, container, editor);
	});
});
