// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import { createDefaultSchema } from "@pen/schema-default";
import { usePlaygroundAISession } from "./usePlaygroundAISession";

const playgroundAISessionMocks = vi.hoisted(() => ({
	ensurePlaygroundAISession: vi.fn(async () => "session-1"),
	queuePlaygroundAISessionSync: vi.fn(),
	cancelQueuedPlaygroundAISessionSync: vi.fn(),
}));

vi.mock("../utils/playgroundAISession", () => ({
	ensurePlaygroundAISession:
		playgroundAISessionMocks.ensurePlaygroundAISession,
	queuePlaygroundAISessionSync:
		playgroundAISessionMocks.queuePlaygroundAISessionSync,
	cancelQueuedPlaygroundAISessionSync:
		playgroundAISessionMocks.cancelQueuedPlaygroundAISessionSync,
	subscribeToPlaygroundAIState: () => () => {},
	getPlaygroundAIStateSnapshot: () => ({
		sessionId: null,
		phase: "idle",
		syncStatus: "idle",
		lastSyncMs: null,
		lastSyncAt: null,
		hasPendingSync: false,
		lastRequest: null,
		lastError: null,
	}),
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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
	.IS_REACT_ACT_ENVIRONMENT = true;

describe("usePlaygroundAISession", () => {
	afterEach(() => {
		playgroundAISessionMocks.ensurePlaygroundAISession.mockClear();
		playgroundAISessionMocks.queuePlaygroundAISessionSync.mockClear();
		playgroundAISessionMocks.cancelQueuedPlaygroundAISessionSync.mockClear();
	});

	it("queues syncs for collaborator commits as well as local commits", async () => {
		const editor = createPlaygroundEditor();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);

		function Probe() {
			usePlaygroundAISession(editor);
			return null;
		}

		await act(async () => {
			root.render(<Probe />);
		});
		await act(async () => {
			await Promise.resolve();
		});

		expect(
			playgroundAISessionMocks.ensurePlaygroundAISession,
		).toHaveBeenCalledTimes(1);
		expect(
			playgroundAISessionMocks.queuePlaygroundAISessionSync,
		).toHaveBeenCalledWith(editor, "initial");

		playgroundAISessionMocks.queuePlaygroundAISessionSync.mockClear();
		const blockId = editor.firstBlock()!.id;
		await act(async () => {
			editor.apply(
				[
					{
						type: "insert-text",
						blockId,
						offset: 0,
						text: "remote change",
					},
				],
				{ origin: "collaborator" },
			);
		});

		expect(
			playgroundAISessionMocks.queuePlaygroundAISessionSync,
		).toHaveBeenCalledWith(editor);

		await act(async () => {
			root.unmount();
		});
		expect(
			playgroundAISessionMocks.cancelQueuedPlaygroundAISessionSync,
		).toHaveBeenCalledTimes(1);

		container.remove();
		editor.destroy();
	});
});
