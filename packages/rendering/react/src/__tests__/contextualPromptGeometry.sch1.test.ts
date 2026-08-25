// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIContextualPromptAnchor } from "@input/pen-ai";
import { collapsedRect, getRootGeometry } from "@input/pen-dom";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import {
	resolveAnchorRect,
	resolveInsertedAnchorRect,
} from "../primitives/ai/contextualPromptGeometry";

let frameQueue: FrameRequestCallback[] = [];

function installMockRaf(): void {
	frameQueue = [];
	vi.stubGlobal(
		"requestAnimationFrame",
		(callback: FrameRequestCallback): number => {
			frameQueue.push(callback);
			return frameQueue.length;
		},
	);
}

function flushFrame(): void {
	const batch = frameQueue.splice(0);
	for (const callback of batch) {
		callback(0);
	}
}

function mountHost(): { root: HTMLElement; host: HTMLElement } {
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	const host = document.createElement("div");
	host.setAttribute(DATA_ATTRS.editorContent, "");
	root.appendChild(host);
	document.body.appendChild(root);
	return { root, host };
}

function blockAnchor(blockId: string): AIContextualPromptAnchor {
	return {
		kind: "block",
		focusBlockId: blockId,
		status: "valid",
		lastResolvedRect: null,
		selectionSnapshot: {
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 0 },
			isMultiBlock: false,
			blockRange: [blockId],
		},
	};
}

describe("contextualPromptGeometry SCH1", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("SCH1 SCH2: unions blockRect through one measureNow when idle", () => {
		const { root, host } = mountHost();
		const box = {
			...collapsedRect(8, 24, 16),
			width: 80,
			right: 88,
			bottom: 40,
		};
		const geometry = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: { blockRect: () => box },
		});

		const rect = resolveAnchorRect(host, blockAnchor("p1"));

		expect(rect).toMatchObject({
			top: 24,
			left: 8,
			width: 80,
			height: 16,
		});
		expect(geometry.scheduler.diagnostics.measureNowCount).toBe(1);
	});

	it("SCH1: reads blockRect in the scheduler read phase without measureNow", async () => {
		const { root, host } = mountHost();
		const box = {
			...collapsedRect(0, 10, 20),
			width: 40,
			right: 40,
			bottom: 30,
		};
		const geometry = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: { blockRect: () => box },
		});

		let rect: ReturnType<typeof resolveInsertedAnchorRect> = null;
		const pending = geometry.scheduler.read(() => {
			expect(geometry.scheduler.phase).toBe("read");
			rect = resolveInsertedAnchorRect(host, blockAnchor("p1"));
		});
		flushFrame();
		await pending;

		expect(rect).toMatchObject({
			top: 10,
			left: 0,
			width: 40,
			height: 20,
		});
		expect(geometry.scheduler.diagnostics.measureNowCount).toBe(0);
	});
});
