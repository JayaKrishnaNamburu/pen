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
	it("exposes AI debug logs through a React hook", async () => {
		const editor = createEditor({
			extensions: [
				aiExtension({
					model: {
						async *stream() {
							yield { type: "text-delta" as const, delta: "planet" };
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
			{ origin: "system" },
		);
		editor.selectTextRange(
			{ blockId, offset: 6 },
			{ blockId, offset: 11 },
		);

		function DebugProbe() {
			const debugLog = useAIDebugLog(editor);

			return (
				<div
					data-status={debugLog.status}
					data-entry-count={String(debugLog.entries.length)}
					data-active-generation-id={debugLog.activeGenerationId ?? undefined}
					data-aggregate-fast-apply-attempt-count={String(
						debugLog.aggregateFastApply.attemptCount,
					)}
					data-aggregate-fast-apply-native-count={String(
						debugLog.aggregateFastApply.nativeFastApplyCount,
					)}
					data-fast-apply-attempt-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.attemptCount)
							: undefined
					}
					data-fast-apply-native-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.nativeFastApplyCount)
							: undefined
					}
					data-fast-apply-scoped-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.scopedReplacementCount)
							: undefined
					}
					data-fast-apply-plain-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.plainMarkdownCount)
							: undefined
					}
					data-fast-apply-failed-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.failedCount)
							: undefined
					}
					data-last-entry-label={
						debugLog.entries[debugLog.entries.length - 1]?.label ?? undefined
					}
				/>
			);
		}

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Pen.Editor.Root editor={editor}>
					<DebugProbe />
				</Pen.Editor.Root>,
			);
		});

		await act(async () => {
			const session = controller?.startSession({
				surface: "inline-edit",
				target: "selection",
			});
			if (session) {
				await controller?.runSessionPrompt(session.id, "Rewrite the selection");
			}
		});

		const probe = container.querySelector("[data-entry-count]");
		expect(Number(probe?.getAttribute("data-entry-count"))).toBeGreaterThan(0);
		expect(probe?.getAttribute("data-active-generation-id")).toBeTruthy();
		expect(probe?.getAttribute("data-aggregate-fast-apply-attempt-count")).toBe("1");
		expect(probe?.getAttribute("data-aggregate-fast-apply-native-count")).toBe("1");
		expect(probe?.getAttribute("data-fast-apply-attempt-count")).toBe("1");
		expect(probe?.getAttribute("data-fast-apply-native-count")).toBe("1");
		expect(probe?.getAttribute("data-fast-apply-scoped-count")).toBe("0");
		expect(probe?.getAttribute("data-fast-apply-plain-count")).toBe("0");
		expect(probe?.getAttribute("data-fast-apply-failed-count")).toBe("0");
		expect(probe?.getAttribute("data-last-entry-label")).toBe("Generation finished");

		await act(async () => {
			root.unmount();
		});
		container.remove();
	});

	it("reads fast-apply metrics for a requested session in the debug hook", async () => {
		const editor = createEditor({
			extensions: [aiExtension({})],
		});
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();

		function DebugProbe(props: { sessionId: string }) {
			const debugLog = useAIDebugLog(editor, { sessionId: props.sessionId });

			return (
				<div
					data-fast-apply-session-id={debugLog.fastApplySessionId ?? undefined}
					data-aggregate-fast-apply-attempt-count={String(
						debugLog.aggregateFastApply.attemptCount,
					)}
					data-aggregate-fast-apply-native-count={String(
						debugLog.aggregateFastApply.nativeFastApplyCount,
					)}
					data-fast-apply-attempt-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.attemptCount)
							: undefined
					}
					data-fast-apply-native-count={
						debugLog.activeSessionFastApply
							? String(debugLog.activeSessionFastApply.nativeFastApplyCount)
							: undefined
					}
				/>
			);
		}

		const bottomChatSession = controller!.startSession({
			surface: "bottom-chat",
			target: "document",
		});
		const inlineSession = controller!.startSession({
			surface: "inline-edit",
			target: "selection",
		});
		expect(controller!.getState().activeSessionId).toBe(inlineSession.id);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		await act(async () => {
			const controllerAny = controller as any;
			controllerAny?._recordSessionFastApplyMetrics(bottomChatSession.id, {
				attempted: true,
				succeeded: true,
				executionPath: "native-fast-apply",
			});
			controllerAny?._recordSessionFastApplyMetrics(bottomChatSession.id, {
				attempted: true,
				succeeded: true,
				executionPath: "scoped-replacement",
			});
			root.render(
				<Pen.Editor.Root editor={editor}>
					<DebugProbe sessionId={bottomChatSession.id} />
				</Pen.Editor.Root>,
			);
			await Promise.resolve();
		});

		const probe = container.querySelector(
			"[data-fast-apply-session-id]",
		) as HTMLElement | null;
		expect(probe?.getAttribute("data-fast-apply-session-id")).toBe(
			bottomChatSession.id,
		);
		expect(probe?.getAttribute("data-aggregate-fast-apply-attempt-count")).toBe("2");
		expect(probe?.getAttribute("data-aggregate-fast-apply-native-count")).toBe("1");
		expect(probe?.getAttribute("data-fast-apply-attempt-count")).toBe("2");
		expect(probe?.getAttribute("data-fast-apply-native-count")).toBe("1");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});


});
