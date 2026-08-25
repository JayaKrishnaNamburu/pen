// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	aiExtension,
	getAIController,
	type AICommandBinding,
} from "@input/pen-ai";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "@input/pen-ai/stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { Pen } from "../primitives/index";
import { defaultSchema } from "@input/pen-schema-default";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const COMMANDS: readonly AICommandBinding[] = [
	{ id: "cmd-a", label: "Alpha", prompt: "alpha" },
	{ id: "cmd-b", label: "Beta", prompt: "beta" },
	{ id: "cmd-c", label: "Gamma", prompt: "gamma" },
];

function dispatchKey(key: string, target: EventTarget) {
	target.dispatchEvent(
		new KeyboardEvent("keydown", {
			key,
			bubbles: true,
			cancelable: true,
		}),
	);
}

function createCommandMenuEditor() {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			documentOpsExtension(),
			aiExtension({ author: "tester" }),
		],
	});
}

type Fixture = {
	container: HTMLElement;
	editor: ReturnType<typeof createCommandMenuEditor>;
	root: ReturnType<typeof createRoot>;
};

const fixtures: Fixture[] = [];

async function renderCommandMenu() {
	const editor = createCommandMenuEditor();
	const controller = getAIController(editor);
	if (!controller) {
		throw new Error("Expected AI controller");
	}
	vi.spyOn(controller, "getCommands").mockReturnValue(COMMANDS);
	vi.spyOn(controller, "runCommand").mockResolvedValue(
		{} as Awaited<ReturnType<typeof controller.runCommand>>,
	);
	vi.spyOn(controller, "closeCommandMenu");
	controller.openCommandMenu();

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
					{ editor },
					createElement(Pen.AI.CommandMenu, null, [
						createElement(Pen.AI.CommandInput, { key: "input" }),
						createElement(Pen.AI.CommandList, { key: "list" }),
					]),
				),
			),
		);
	});

	const fixture = { container, editor, root };
	fixtures.push(fixture);
	return { ...fixture, controller };
}

afterEach(async () => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		await act(async () => {
			fixture.root.unmount();
		});
		fixture.container.remove();
		fixture.editor.destroy();
	}
	vi.restoreAllMocks();
});

describe("@input/pen-react AI command menu AX3", () => {
	it("AX3 exposes listbox option ids and combobox popup aria without moving focus", async () => {
		const { container } = await renderCommandMenu();

		const listbox = container.querySelector<HTMLElement>(
			"[data-pen-ai-command-list]",
		);
		const options = container.querySelectorAll<HTMLElement>(
			"[data-pen-ai-command-item]",
		);
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);

		expect(listbox?.getAttribute("role")).toBe("listbox");
		expect(listbox?.id).toBeTruthy();
		expect(options).toHaveLength(3);
		expect(options[0]?.getAttribute("role")).toBe("option");
		expect(options[0]?.id).toBe(`${listbox?.id}-option-0`);
		expect(options[0]?.getAttribute("aria-selected")).toBe("true");
		expect(options[0]?.tabIndex).toBe(-1);

		expect(input?.getAttribute("role")).toBe("combobox");
		expect(input?.getAttribute("aria-controls")).toBe(listbox?.id);
		expect(input?.getAttribute("aria-expanded")).toBe("true");
		expect(input?.getAttribute("aria-activedescendant")).toBe(
			options[0]?.id,
		);

		await act(async () => {
			input?.focus();
		});
		expect(document.activeElement).toBe(input);

		await act(async () => {
			dispatchKey("ArrowDown", input ?? document);
		});

		expect(document.activeElement).toBe(input);
		expect(
			document.activeElement?.closest("[data-pen-ai-command-item]"),
		).toBeNull();
		expect(input?.getAttribute("aria-activedescendant")).toBe(
			options[1]?.id,
		);
		expect(options[1]?.getAttribute("aria-selected")).toBe("true");
		expect(options[0]?.getAttribute("aria-selected")).toBe("false");
	});

	it("AX3 Home End Arrow Enter Escape navigate the selected command", async () => {
		const { container, controller } = await renderCommandMenu();
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);
		const options = container.querySelectorAll<HTMLElement>(
			"[data-pen-ai-command-item]",
		);

		await act(async () => {
			input?.focus();
		});
		expect(document.activeElement).toBe(input);

		await act(async () => {
			dispatchKey("End", input ?? document);
		});
		expect(input?.getAttribute("aria-activedescendant")).toBe(
			options[2]?.id,
		);

		await act(async () => {
			dispatchKey("Home", input ?? document);
		});
		expect(input?.getAttribute("aria-activedescendant")).toBe(
			options[0]?.id,
		);

		await act(async () => {
			dispatchKey("ArrowUp", input ?? document);
		});
		expect(input?.getAttribute("aria-activedescendant")).toBe(
			options[2]?.id,
		);
		expect(document.activeElement).toBe(input);

		await act(async () => {
			dispatchKey("Enter", input ?? document);
		});
		expect(controller.closeCommandMenu).toHaveBeenCalled();
		expect(controller.runCommand).toHaveBeenCalledWith("cmd-c");

		await act(async () => {
			controller.openCommandMenu();
		});

		await act(async () => {
			dispatchKey("Escape", input ?? document);
		});
		expect(controller.closeCommandMenu).toHaveBeenCalled();
		expect(document.activeElement).toBe(input);
	});

	it("AX3 Tab accepts the active command", async () => {
		const { container, controller } = await renderCommandMenu();
		const input = container.querySelector<HTMLInputElement>(
			"[data-pen-ai-command-input]",
		);

		await act(async () => {
			input?.focus();
			dispatchKey("Tab", input ?? document);
		});

		expect(controller.closeCommandMenu).toHaveBeenCalled();
		expect(controller.runCommand).toHaveBeenCalledWith("cmd-a");
		expect(document.activeElement).toBe(input);
	});
});
