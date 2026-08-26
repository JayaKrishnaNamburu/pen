// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@input/pen-types";
import { getRootGeometry } from "../geometry/rootGeometry";
import { collapsedRect } from "../geometry/types";
import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	resolveAnchoredMenuPosition,
	type AnchoredMenuPosition,
} from "../utils/menuPosition";

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

function editorWithTextSelection(blockId: string): Editor {
	return {
		selection: {
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 1 },
		},
	} as Editor;
}

describe("resolveAnchoredMenuPosition", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("reads caretRect through measureNow when idle", () => {
		const root = mountRoot();
		const caret = collapsedRect(40, 80, 18);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				caretRect: () => caret,
			},
		});

		const position = resolveAnchoredMenuPosition({
			alignOffset: 0,
			editor: editorWithTextSelection("p1"),
			element: root,
			minHeight: 120,
			preferredSide: "bottom",
			sideOffset: 10,
			target: { blockId: "p1", startOffset: 0, endOffset: 2 },
			viewportPadding: 16,
		});

		expect(position).not.toBeNull();
		expect(position?.side).toBe("bottom");
		expect(position?.top).toBe(caret.bottom + 10);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);
	});

	it("reads caretRect in the scheduler read phase without measureNow", async () => {
		const root = mountRoot();
		const caret = collapsedRect(16, 24, 14);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				caretRect: () => caret,
			},
		});

		const seen: { position: AnchoredMenuPosition | null } = {
			position: null,
		};
		const pending = host.scheduler.read(() => {
			expect(host.scheduler.phase).toBe("read");
			seen.position = resolveAnchoredMenuPosition({
				alignOffset: 0,
				editor: editorWithTextSelection("p1"),
				element: root,
				minHeight: 80,
				preferredSide: "bottom",
				sideOffset: 8,
				target: { blockId: "p1", startOffset: 0, endOffset: 1 },
				viewportPadding: 8,
			});
		});
		flushFrame();
		await pending;

		expect(seen.position?.top).toBe(caret.bottom + 8);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
	});
});
