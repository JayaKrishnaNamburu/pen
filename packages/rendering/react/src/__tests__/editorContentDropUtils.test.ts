// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collapsedRect, getRootGeometry } from "@input/pen-dom";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import {
	readInlineDropCaretStyle,
	resolveBlockDropTarget,
} from "../primitives/editor/editorContentDropUtils";

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

function mountRoot(): HTMLElement {
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	document.body.appendChild(root);
	return root;
}

describe("editorContentDropUtils geometry wiring", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("reads caretRect through measureNow when idle", () => {
		const root = mountRoot();
		const caret = collapsedRect(12, 30, 16);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: { caretRect: () => caret },
		});

		const style = readInlineDropCaretStyle(root, {
			blockId: "p1",
			offset: 2,
		});

		expect(style).toEqual({
			left: 12,
			top: 30,
			height: 18,
		});
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);
	});

	it("reads caretRect in the scheduler read phase without measureNow", async () => {
		const root = mountRoot();
		const caret = collapsedRect(4, 8, 20);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: { caretRect: () => caret },
		});

		let style: ReturnType<typeof readInlineDropCaretStyle> = null;
		const pending = host.scheduler.read(() => {
			expect(host.scheduler.phase).toBe("read");
			style = readInlineDropCaretStyle(root, {
				blockId: "p1",
				offset: 0,
			});
		});
		flushFrame();
		await pending;

		expect(style).toEqual({
			left: 4,
			top: 8,
			height: 20,
		});
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
	});

	it("resolves block drop targets from blockRect through measureNow", () => {
		const root = mountRoot();
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				blockRect: (blockId) => {
					if (blockId === "a") {
						return {
							...collapsedRect(0, 0, 20),
							width: 100,
							right: 100,
							bottom: 20,
						};
					}
					if (blockId === "b") {
						return {
							...collapsedRect(0, 40, 20),
							width: 100,
							right: 100,
							bottom: 60,
						};
					}
					return null;
				},
			},
		});

		const target = resolveBlockDropTarget({
			blockIds: ["a", "b"],
			blocksHost: root,
			draggedBlockIds: [],
			clientY: 56,
		});

		expect(target).toEqual({ blockId: "b", position: "after" });
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);
	});
});
