// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@input/pen-types";
import { resolveDropTarget } from "../field-editor/dropResolver";
import { getRootGeometry } from "../geometry/rootGeometry";
import { collapsedRect } from "../geometry/types";
import { DATA_ATTRS } from "../utils/dataAttributes";

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
	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	block.setAttribute("data-block-id", "p1");
	root.appendChild(block);
	document.body.appendChild(root);
	Object.defineProperty(root.ownerDocument, "elementFromPoint", {
		configurable: true,
		value: () => block,
	});
	return root;
}

function editorStub(): Editor {
	return {
		getBlock: () => ({ type: "paragraph" }),
		schema: { resolve: () => ({ content: "inline" }) },
		lastBlock: () => ({ id: "p1" }),
	} as unknown as Editor;
}

describe("resolveDropTarget SCH1", () => {
	beforeEach(() => {
		installMockRaf();
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	it("SCH1 SCH2: reads blockRect through one measureNow when idle", () => {
		const root = mountRoot();
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				blockRect: () => ({
					...collapsedRect(0, 0, 20),
					width: 100,
					right: 100,
					bottom: 20,
				}),
			},
		});

		const target = resolveDropTarget(editorStub(), root, 10, 80);

		expect(target).toEqual({
			kind: "block-edge",
			blockId: "p1",
			side: "after",
			position: { after: "p1" },
		});
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);
		expect(host.scheduler.phase).toBe("idle");
	});

	it("SCH1: reads blockRect in the scheduler read phase without measureNow", async () => {
		const root = mountRoot();
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				blockRect: () => ({
					...collapsedRect(0, 0, 20),
					width: 100,
					right: 100,
					bottom: 20,
				}),
			},
		});

		let target: ReturnType<typeof resolveDropTarget> = null;
		const pending = host.scheduler.read(() => {
			expect(host.scheduler.phase).toBe("read");
			target = resolveDropTarget(editorStub(), root, 10, 80);
		});
		flushFrame();
		await pending;

		expect(target).toEqual({
			kind: "block-edge",
			blockId: "p1",
			side: "after",
			position: { after: "p1" },
		});
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
	});

	it("SCH3 I9: a read queued during write lands in the next flush", async () => {
		const root = mountRoot();
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
			measure: {
				blockRect: () => ({
					...collapsedRect(0, 0, 20),
					width: 100,
					right: 100,
					bottom: 20,
				}),
			},
		});
		const order: string[] = [];

		const writeDone = host.scheduler.write(() => {
			order.push("write");
			void host.scheduler.read(() => {
				order.push("read-next");
				resolveDropTarget(editorStub(), root, 10, 80);
			});
		});

		flushFrame();
		await writeDone;
		expect(order).toEqual(["write"]);

		flushFrame();
		expect(order).toEqual(["write", "read-next"]);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);
	});
});
