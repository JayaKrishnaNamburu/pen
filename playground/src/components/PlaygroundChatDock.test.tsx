// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { createDefaultSchema } from "@pen/schema-default";
import { PlaygroundChatDock } from "./PlaygroundChatDock";

const penReactMocks = vi.hoisted(() => ({
	useAISessionActions: vi.fn(),
	useAISessions: vi.fn(),
}));

vi.mock("@pen/react", () => ({
	useAISessionActions: penReactMocks.useAISessionActions,
	useAISessions: penReactMocks.useAISessions,
}));

vi.mock("./DebugPanel", () => ({
	DebugPanel: () => null,
}));

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createPlaygroundEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
	const valueSetter = Object.getOwnPropertyDescriptor(
		HTMLTextAreaElement.prototype,
		"value",
	)?.set;
	valueSetter?.call(textarea, value);
	textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
	.IS_REACT_ACT_ENVIRONMENT = true;

describe("PlaygroundChatDock", () => {
	afterEach(() => {
		penReactMocks.useAISessionActions.mockReset();
		penReactMocks.useAISessions.mockReset();
	});

	it("starts a fresh bottom-chat session after stop", async () => {
		const editor = createPlaygroundEditor();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const firstGeneration = createDeferred<{
			suggestionIds: string[];
			reviewItems: [];
			mutationReceipt: { status: "staged_suggestions" };
		}>();
		const secondGeneration = createDeferred<{
			suggestionIds: [];
			reviewItems: [];
			mutationReceipt: { status: "applied" };
		}>();
		let runCount = 0;
		const sessionActions = {
			startSession: vi
				.fn()
				.mockReturnValueOnce({ id: "session-1" })
				.mockReturnValueOnce({ id: "session-2" }),
			canReuseSessionPrompt: vi.fn().mockReturnValue(true),
			runSessionPrompt: vi.fn(async () => {
				runCount += 1;
				if (runCount === 1) {
					return await firstGeneration.promise;
				}
				return await secondGeneration.promise;
			}),
			cancelSession: vi.fn(),
		};

		penReactMocks.useAISessionActions.mockReturnValue(sessionActions);
		penReactMocks.useAISessions.mockReturnValue([]);

		await act(async () => {
			root.render(
				<PlaygroundChatDock
					editor={editor}
					autocompleteEnabled={false}
					customCaretEnabled={false}
					onAutocompleteEnabledChange={() => {}}
					onCustomCaretEnabledChange={() => {}}
				/>,
			);
		});

		const form = container.querySelector("form");
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(form).not.toBeNull();
		expect(textarea).not.toBeNull();

		await act(async () => {
			setTextareaValue(textarea!, "First prompt");
		});

		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		const stopButton = Array.from(
			container.querySelectorAll("button"),
		).find((button) => button.textContent?.includes("Stop")) as
			| HTMLButtonElement
			| undefined;
		expect(stopButton?.textContent).toContain("Stop");

		await act(async () => {
			stopButton?.click();
			await Promise.resolve();
		});

		firstGeneration.resolve({
			suggestionIds: ["suggestion-1"],
			reviewItems: [],
			mutationReceipt: { status: "staged_suggestions" },
		});
		await act(async () => {
			await Promise.resolve();
		});

		await act(async () => {
			setTextareaValue(textarea!, "Second prompt");
		});

		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		secondGeneration.resolve({
			suggestionIds: [],
			reviewItems: [],
			mutationReceipt: { status: "applied" },
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(sessionActions.cancelSession).toHaveBeenCalledWith("session-1");
		expect(sessionActions.startSession).toHaveBeenCalledTimes(2);
		expect(sessionActions.runSessionPrompt).toHaveBeenNthCalledWith(
			1,
			"session-1",
			"First prompt",
			{ target: "document" },
		);
		expect(sessionActions.runSessionPrompt).toHaveBeenNthCalledWith(
			2,
			"session-2",
			"Second prompt",
			{ target: "document" },
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("starts a fresh session when the selected range changes", async () => {
		const editor = createPlaygroundEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world again" }],
			{ origin: "system" },
		);
		editor.selectTextRange(
			{ blockId, offset: 6 },
			{ blockId, offset: 11 },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const sessionActions = {
			startSession: vi
				.fn()
				.mockReturnValueOnce({ id: "session-1" })
				.mockReturnValueOnce({ id: "session-2" }),
			canReuseSessionPrompt: vi
				.fn()
				.mockReturnValue(false),
			runSessionPrompt: vi
				.fn()
				.mockResolvedValue({ suggestionIds: [], reviewItems: [], mutationReceipt: { status: "applied" } }),
			cancelSession: vi.fn(),
		};

		penReactMocks.useAISessionActions.mockReturnValue(sessionActions);
		penReactMocks.useAISessions.mockReturnValue([]);

		await act(async () => {
			root.render(
				<PlaygroundChatDock
					editor={editor}
					autocompleteEnabled={false}
					customCaretEnabled={false}
					onAutocompleteEnabledChange={() => {}}
					onCustomCaretEnabledChange={() => {}}
				/>,
			);
		});

		const form = container.querySelector("form");
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(form).not.toBeNull();
		expect(textarea).not.toBeNull();

		await act(async () => {
			setTextareaValue(textarea!, "Rewrite this");
		});
		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		editor.selectTextRange(
			{ blockId, offset: 12 },
			{ blockId, offset: 17 },
		);

		await act(async () => {
			setTextareaValue(textarea!, "Rewrite that");
		});
		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		expect(sessionActions.cancelSession).not.toHaveBeenCalled();
		expect(sessionActions.startSession).toHaveBeenCalledTimes(2);
		expect(sessionActions.startSession).toHaveBeenNthCalledWith(1, {
			surface: "bottom-chat",
			target: "selection",
		});
		expect(sessionActions.startSession).toHaveBeenNthCalledWith(2, {
			surface: "bottom-chat",
			target: "selection",
		});
		expect(sessionActions.runSessionPrompt).toHaveBeenNthCalledWith(
			1,
			"session-1",
			"Rewrite this",
			{ target: "selection" },
		);
		expect(sessionActions.runSessionPrompt).toHaveBeenNthCalledWith(
			2,
			"session-2",
			"Rewrite that",
			{ target: "selection" },
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("keeps continue-writing prompts document-targeted even with a selection", async () => {
		const editor = createPlaygroundEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world again" }],
			{ origin: "system" },
		);
		editor.selectTextRange(
			{ blockId, offset: 6 },
			{ blockId, offset: 11 },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const sessionActions = {
			startSession: vi.fn().mockReturnValue({ id: "session-1" }),
			canReuseSessionPrompt: vi.fn().mockReturnValue(true),
			runSessionPrompt: vi
				.fn()
				.mockResolvedValue({ suggestionIds: [], reviewItems: [], mutationReceipt: { status: "applied" } }),
			cancelSession: vi.fn(),
		};

		penReactMocks.useAISessionActions.mockReturnValue(sessionActions);
		penReactMocks.useAISessions.mockReturnValue([]);

		await act(async () => {
			root.render(
				<PlaygroundChatDock
					editor={editor}
					autocompleteEnabled={false}
					customCaretEnabled={false}
					onAutocompleteEnabledChange={() => {}}
					onCustomCaretEnabledChange={() => {}}
				/>,
			);
		});

		const form = container.querySelector("form");
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(form).not.toBeNull();
		expect(textarea).not.toBeNull();

		await act(async () => {
			setTextareaValue(textarea!, "Continue writing");
		});
		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		expect(sessionActions.startSession).toHaveBeenCalledWith({
			surface: "bottom-chat",
			target: "block",
		});
		expect(sessionActions.runSessionPrompt).toHaveBeenCalledWith(
			"session-1",
			"Continue writing",
			{ target: "block" },
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("routes rewrite prompts without a selection to the active block", async () => {
		const editor = createPlaygroundEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world again" }],
			{ origin: "system" },
		);
		editor.selectTextRange(
			{ blockId, offset: 5 },
			{ blockId, offset: 5 },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const sessionActions = {
			startSession: vi.fn().mockReturnValue({ id: "session-1" }),
			canReuseSessionPrompt: vi.fn().mockReturnValue(true),
			runSessionPrompt: vi
				.fn()
				.mockResolvedValue({ suggestionIds: [], reviewItems: [], mutationReceipt: { status: "applied" } }),
			cancelSession: vi.fn(),
		};

		penReactMocks.useAISessionActions.mockReturnValue(sessionActions);
		penReactMocks.useAISessions.mockReturnValue([]);

		await act(async () => {
			root.render(
				<PlaygroundChatDock
					editor={editor}
					autocompleteEnabled={false}
					customCaretEnabled={false}
					onAutocompleteEnabledChange={() => {}}
					onCustomCaretEnabledChange={() => {}}
				/>,
			);
		});

		const form = container.querySelector("form");
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(form).not.toBeNull();
		expect(textarea).not.toBeNull();

		await act(async () => {
			setTextareaValue(textarea!, "Rewrite this");
		});
		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		expect(sessionActions.startSession).toHaveBeenCalledWith({
			surface: "bottom-chat",
			target: "block",
		});
		expect(sessionActions.runSessionPrompt).toHaveBeenCalledWith(
			"session-1",
			"Rewrite this",
			{ target: "block" },
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("routes whole-document rewrite prompts to the document target", async () => {
		const editor = createPlaygroundEditor();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world again" }],
			{ origin: "system" },
		);

		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const sessionActions = {
			startSession: vi.fn().mockReturnValue({ id: "session-1" }),
			canReuseSessionPrompt: vi.fn().mockReturnValue(true),
			runSessionPrompt: vi
				.fn()
				.mockResolvedValue({ suggestionIds: [], reviewItems: [], mutationReceipt: { status: "applied" } }),
			cancelSession: vi.fn(),
		};

		penReactMocks.useAISessionActions.mockReturnValue(sessionActions);
		penReactMocks.useAISessions.mockReturnValue([]);

		await act(async () => {
			root.render(
				<PlaygroundChatDock
					editor={editor}
					autocompleteEnabled={false}
					customCaretEnabled={false}
					onAutocompleteEnabledChange={() => {}}
					onCustomCaretEnabledChange={() => {}}
				/>,
			);
		});

		const form = container.querySelector("form");
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement | null;
		expect(form).not.toBeNull();
		expect(textarea).not.toBeNull();

		await act(async () => {
			setTextareaValue(
				textarea!,
				"Rewrite the whole story. Make it about a startup from Amsterdam.",
			);
		});
		await act(async () => {
			form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
			await Promise.resolve();
		});

		expect(sessionActions.startSession).toHaveBeenCalledWith({
			surface: "bottom-chat",
			target: "document",
		});
		expect(sessionActions.runSessionPrompt).toHaveBeenCalledWith(
			"session-1",
			"Rewrite the whole story. Make it about a startup from Amsterdam.",
			{ target: "document" },
		);

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});

	it("renders transcript history from bottom-chat session turns", async () => {
		const editor = createPlaygroundEditor();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		const sessionActions = {
			startSession: vi.fn(),
			canReuseSessionPrompt: vi.fn(),
			runSessionPrompt: vi.fn(),
			cancelSession: vi.fn(),
		};

		penReactMocks.useAISessionActions.mockReturnValue(sessionActions);
		penReactMocks.useAISessions.mockReturnValue([
			{
				id: "session-1",
				surface: "bottom-chat",
				status: "streaming",
				target: { kind: "document" },
				turns: [
					{
						id: "turn-1",
						prompt: "Write a story",
						createdAt: 1,
						target: "document",
						status: "accepted",
						suggestionIds: ["suggestion-1"],
						reviewItemIds: [],
						generatedBlockIds: ["block-1"],
					},
					{
						id: "turn-2",
						prompt: "Actually make it about cats",
						createdAt: 2,
						target: "document",
						status: "streaming",
						suggestionIds: [],
						reviewItemIds: [],
						generatedBlockIds: [],
					},
				],
				promptHistory: [],
				generationIds: [],
				pendingSuggestionIds: [],
				pendingReviewItemIds: [],
				createdAt: 1,
				updatedAt: 2,
				metrics: {
					streamEventCount: 0,
					patchCount: 0,
					fastApply: {
						attemptCount: 0,
						nativeFastApplyCount: 0,
						scopedReplacementCount: 0,
						plainMarkdownCount: 0,
						failedCount: 0,
					},
				},
			},
		]);

		await act(async () => {
			root.render(
				<PlaygroundChatDock
					editor={editor}
					autocompleteEnabled={false}
					customCaretEnabled={false}
					onAutocompleteEnabledChange={() => {}}
					onCustomCaretEnabledChange={() => {}}
				/>,
			);
		});

		expect(container.textContent).toContain("Write a story");
		expect(container.textContent).toContain("Staged suggestions in the editor.");
		expect(container.textContent).toContain("Actually make it about cats");
		expect(container.textContent).toContain("Writing in the editor...");

		await act(async () => {
			root.unmount();
		});
		container.remove();
		editor.destroy();
	});
});
