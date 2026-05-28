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
	it("renders database target previews from streamed structured plans", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "database_edit",
									blockId: "database-1",
									steps: [
										{
											op: "add_view",
											view: {
												id: "view-list",
												title: "List view",
												type: "list",
												visibleColumnIds: ["name", "status"],
												columnOrder: ["name", "status"],
												sort: [],
												filter: null,
												groupBy: null,
												pageIndex: 0,
												pageSize: 50,
											},
										},
									],
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
				{
					type: "insert-block",
					blockId: "database-1",
					blockType: "database",
					props: {},
					position: { after: firstBlockId },
				},
			],
			{ origin: "system" },
		);
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.AI.Root editor={editor}>
						<Pen.AI.StructuredTargetPreview />
					</Pen.AI.Root>
				</Pen.Editor.Root>,
			);
		});

		await act(async () => {
			await controller?.runPrompt("Add a grouped list view", {
				blockId: "database-1",
			});
		});
		await act(async () => {
			await Promise.resolve();
		});

		const previewRoot = container.querySelector(
			"[data-pen-ai-structured-target-preview]",
		);
		const databasePreview = container.querySelector(
			'[data-structured-target-kind="database"]',
		);
		const databaseViews = container.querySelectorAll("[data-structured-preview-view]");
		const databaseViewLabels = [...databaseViews].map((item) => item.textContent ?? "");
		const activeDatabaseViews = [...databaseViews].filter((item) =>
			item.hasAttribute("data-active"),
		);

		expect(previewRoot?.getAttribute("data-target-count")).toBe("1");
		expect(databasePreview?.textContent).toContain("Database preview");
		expect(databasePreview?.textContent).toContain("List view");
		expect(databaseViewLabels).toContain("List view");
		expect(databaseViews.length).toBeGreaterThanOrEqual(1);
		expect(activeDatabaseViews.length).toBe(1);

		await act(async () => {
			root.unmount();
		});
		container.remove();
	});

	it("keeps virtual structured preview targets out of editor block gesture handling", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "review_bundle",
									label: "Insert database",
									reason: "Add a structured data block.",
									plans: [
										{
											kind: "block_insert",
											blockId: "database-preview",
											blockType: "database",
											position: { after: blockId },
										},
										{
											kind: "database_edit",
											blockId: "database-preview",
											steps: [
												{
													op: "add_column",
													column: {
														id: "name",
														title: "Name",
														type: "text",
													},
												},
											],
										},
									],
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Intro" }],
			{ origin: "system" },
		);
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<Pen.AI.Root editor={editor}>
						<Pen.Editor.Content />
					</Pen.AI.Root>
				</Pen.Editor.Root>,
			);
		});

		await act(async () => {
			await controller?.runPrompt("Insert a database below this block", {
				blockId,
			});
		});

		const virtualTarget = container.querySelector(
			"[data-pen-ai-structured-virtual-target]",
		) as HTMLElement | null;
		const previewItem = virtualTarget?.querySelector(
			"[data-structured-target-preview-item]",
		) as HTMLElement | null;
		expect(virtualTarget).not.toBeNull();
		expect(virtualTarget?.hasAttribute("data-pen-ignore-pointer-gesture")).toBe(true);
		expect(previewItem?.hasAttribute("data-block-id")).toBe(false);

		await act(async () => {
			editor.selectBlock(blockId);
		});
		const selectionBefore = editor.getSelection();

		await act(async () => {
			previewItem?.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true, button: 0 }),
			);
			previewItem?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			previewItem?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(editor.getSelection()).toEqual(selectionBefore);

		await act(async () => {
			root.unmount();
		});
		container.remove();
	});


});
