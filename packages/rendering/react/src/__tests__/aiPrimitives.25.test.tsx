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
	it("renders block structured previews while a block plan is still streaming", async () => {
		const releaseSecondDelta = createDeferred();
		let streamedBlockId = "";
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "text-delta" as const,
								delta:
									`{"kind":"block_convert","blockId":"${streamedBlockId}","newType":"heading"`,
							};
							await releaseSecondDelta.promise;
							yield {
								type: "text-delta" as const,
								delta: ',"props":{"level":2}}',
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		streamedBlockId = blockId;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
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
						<Pen.AI.Progress />
						<Pen.AI.ChangeList />
					</Pen.AI.Root>
				</Pen.Editor.Root>,
			);
		});

		let generationPromise: Promise<unknown> | null = null;
		await act(async () => {
			generationPromise = controller?.runPrompt("Convert block to heading", {
				blockId,
			}) ?? null;
			for (let tick = 0; tick < 6; tick += 1) {
				await Promise.resolve();
			}
		});

		const progress = container.querySelector("[data-pen-ai-progress]");
		const changeList = container.querySelector("[data-pen-ai-change-list]");
		const reviewItemsDuringPreview = container.querySelectorAll("[data-review-item]");

		expect(progress?.getAttribute("data-structured-preview-count")).toBe("1");
		expect(progress?.getAttribute("data-structured-preview-state")).toBe("drafted");
		expect(changeList?.getAttribute("data-review-preview-active")).toBe("");
		expect(reviewItemsDuringPreview).toHaveLength(1);
		expect(reviewItemsDuringPreview[0]?.textContent).toContain("Convert block");
		expect(
			reviewItemsDuringPreview[0]?.querySelector("[data-review-item-kind-label]")
				?.textContent,
		).toBe("Updated");

		await act(async () => {
			releaseSecondDelta.resolve();
			await generationPromise;
		});

		expect(
			Number(progress?.getAttribute("data-structured-preview-patch-count") ?? "0"),
		).toBeGreaterThanOrEqual(3);
		expect(progress?.getAttribute("data-structured-preview-state")).toBe("validated");
		expect(changeList?.getAttribute("data-review-preview-active")).toBeNull();

		await act(async () => {
			root.unmount();
		});
		container.remove();
	});


	it("renders view comparison sections for structural review items", async () => {
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
												visibleColumnIds: ["name", "tags"],
												columnOrder: ["name", "tags", "done"],
												sort: [{ columnId: "name", direction: "asc" }],
												filter: null,
												groupBy: "tags",
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
						<Pen.AI.ChangeList />
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

		expect(
			container.querySelector("[data-review-comparison-section-label]")?.textContent,
		).toBe("View changes");
		expect(
			container.querySelector("[data-review-comparison-kind-label]")?.textContent,
		).toBe("Added");
		expect(
			container.querySelector("[data-review-comparison-label]")?.textContent,
		).toBe("View");

		await act(async () => {
			root.unmount();
		});
		container.remove();
	});


});
