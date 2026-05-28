// @vitest-environment jsdom

import React, { act } from "react";
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { createEditor } from "@pen/core";
import { defineExtension, type ToolRuntime } from "@pen/types";
import { aiExtension, getAIController } from "@pen/ai";
import { defaultPreset } from "@pen/preset-default";
import {
	Pen,
	useAIActions,
	useAISessions,
	useActiveAISession,
	useAIDebugLog,
} from "../index";

(
	globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createKeyDownEvent(
	key: string,
	options: KeyboardEventInit = {},
): KeyboardEvent {
	return new KeyboardEvent("keydown", {
		key,
		bubbles: true,
		cancelable: true,
		...options,
	});
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
}

function withNavigatorPlatform<T>(platform: string, run: () => T): T {
	const descriptor = Object.getOwnPropertyDescriptor(navigator, "platform");
	Object.defineProperty(navigator, "platform", {
		configurable: true,
		value: platform,
	});
	try {
		return run();
	} finally {
		if (descriptor) {
			Object.defineProperty(navigator, "platform", descriptor);
		}
	}
}

function mockSelectionToolbarRect(rect: {
	top: number;
	left: number;
	width: number;
	height: number;
}) {
	const originalGetSelection = window.getSelection.bind(window);
	const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
	const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
	const rangeRect = {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height,
		right: rect.left + rect.width,
		bottom: rect.top + rect.height,
		x: rect.left,
		y: rect.top,
		toJSON() {
			return this;
		},
	} as DOMRect;

	Object.defineProperty(window, "getSelection", {
		configurable: true,
		value: () => ({
			rangeCount: 1,
			getRangeAt: () => ({
				getBoundingClientRect: () => rangeRect,
			}),
		}),
	});
	Object.defineProperty(window, "requestAnimationFrame", {
		configurable: true,
		value: (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		},
	});
	Object.defineProperty(window, "cancelAnimationFrame", {
		configurable: true,
		value: () => { },
	});

	return () => {
		Object.defineProperty(window, "getSelection", {
			configurable: true,
			value: originalGetSelection,
		});
		Object.defineProperty(window, "requestAnimationFrame", {
			configurable: true,
			value: originalRequestAnimationFrame,
		});
		Object.defineProperty(window, "cancelAnimationFrame", {
			configurable: true,
			value: originalCancelAnimationFrame,
		});
	};
}

function mockMutableSelectionToolbarRect(initialRect: {
	top: number;
	left: number;
	width: number;
	height: number;
}) {
	const rect = { ...initialRect };
	const originalGetSelection = window.getSelection.bind(window);
	const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
	const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);

	Object.defineProperty(window, "getSelection", {
		configurable: true,
		value: () => ({
			rangeCount: 1,
			getRangeAt: () => ({
				getBoundingClientRect: () =>
					({
						top: rect.top,
						left: rect.left,
						width: rect.width,
						height: rect.height,
						right: rect.left + rect.width,
						bottom: rect.top + rect.height,
						x: rect.left,
						y: rect.top,
						toJSON() {
							return this;
						},
					}) as DOMRect,
			}),
		}),
	});
	Object.defineProperty(window, "requestAnimationFrame", {
		configurable: true,
		value: (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		},
	});
	Object.defineProperty(window, "cancelAnimationFrame", {
		configurable: true,
		value: () => { },
	});

	return {
		rect,
		restore: () => {
			Object.defineProperty(window, "getSelection", {
				configurable: true,
				value: originalGetSelection,
			});
			Object.defineProperty(window, "requestAnimationFrame", {
				configurable: true,
				value: originalRequestAnimationFrame,
			});
			Object.defineProperty(window, "cancelAnimationFrame", {
				configurable: true,
				value: originalCancelAnimationFrame,
			});
		},
	};
}

async function waitForAttributeValue(
	readValue: () => string | null | undefined,
	expectedValue: string,
	maxTicks = 12,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (readValue() === expectedValue) {
			return;
		}
		await Promise.resolve();
	}
}

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

function testStreamingToolExtension() {
	let toolRuntime: ToolRuntime | null = null;

	return defineExtension({
		name: "test-streaming-tool",
		dependencies: ["document-ops"],
		activateClient: async ({ editor }) => {
			toolRuntime = editor.internals.getSlot<ToolRuntime>("document-ops:toolRuntime") ?? null;
			toolRuntime?.registerTool({
				name: "test_search",
				description: "Test streaming search tool",
				inputSchema: {
					type: "object",
					required: ["query"],
					properties: {
						query: { type: "string" },
					},
				},
				async *handler(input: unknown) {
					const { query } = input as { query: string };
					yield `searching:${query}`;
					yield { matches: 2, query };
				},
			});
		},
		deactivateClient: async () => {
			toolRuntime?.unregisterTool("test_search");
			toolRuntime = null;
		},
	});
}

describe("@pen/react AI primitives", () => {
	it("does not cancel pointer interaction on the inline session textarea", async () => {
		const restoreSelectionRect = mockSelectionToolbarRect({
			top: 120,
			left: 180,
			width: 80,
			height: 20,
		});
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
			{ origin: "system" },
		);
		editor.selectTextRange(
			{ blockId, offset: 0 },
			{ blockId, offset: 5 },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.AI.Root editor={editor}>
						<Pen.SelectionToolbar.Root>
							<Pen.SelectionToolbar.Content>
								<Pen.AI.SelectionTrigger shortcut="ctrl+j">
									AI
								</Pen.AI.SelectionTrigger>
							</Pen.SelectionToolbar.Content>
							<Pen.AI.InlineSession />
						</Pen.SelectionToolbar.Root>
					</Pen.AI.Root>
				</Pen.Editor.Root>,
			);
			await Promise.resolve();
		});

		await act(async () => {
			document.dispatchEvent(
				createKeyDownEvent("j", { ctrlKey: true }),
			);
			await Promise.resolve();
		});

		const textarea = container.querySelector(
			"[data-pen-ai-inline-session-input]",
		) as HTMLTextAreaElement | null;
		expect(textarea).not.toBeNull();

		const pointerDownEvent = new Event("pointerdown", {
			bubbles: true,
			cancelable: true,
		});

		expect(textarea?.dispatchEvent(pointerDownEvent)).toBe(true);

		await act(async () => {
			root.unmount();
		});
		restoreSelectionRect();
		container.remove();
	});

	it("keeps prompt textarea key events out of editor keyboard handling", async () => {
		const restoreSelectionRect = mockSelectionToolbarRect({
			top: 120,
			left: 180,
			width: 80,
			height: 20,
		});
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
			{ origin: "system" },
		);
		editor.selectTextRange(
			{ blockId, offset: 0 },
			{ blockId, offset: 5 },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.AI.Root editor={editor}>
						<Pen.SelectionToolbar.Root>
							<Pen.SelectionToolbar.Content>
								<Pen.AI.SelectionTrigger shortcut="ctrl+j">
									AI
								</Pen.AI.SelectionTrigger>
							</Pen.SelectionToolbar.Content>
							<Pen.AI.InlineSession />
						</Pen.SelectionToolbar.Root>
					</Pen.AI.Root>
				</Pen.Editor.Root>,
			);
			await Promise.resolve();
		});

		await act(async () => {
			document.dispatchEvent(
				createKeyDownEvent("j", { ctrlKey: true }),
			);
			await Promise.resolve();
		});

		const textarea = container.querySelector(
			"[data-pen-ai-inline-session-input]",
		) as HTMLTextAreaElement | null;
		expect(textarea).not.toBeNull();

		const backspaceEvent = createKeyDownEvent("Backspace");
		await act(async () => {
			textarea?.focus();
			await Promise.resolve();
		});

		expect(textarea?.dispatchEvent(backspaceEvent)).toBe(true);

		await act(async () => {
			root.unmount();
		});
		restoreSelectionRect();
		container.remove();
	});


});
