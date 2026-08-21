// @vitest-environment jsdom

import { createHeadlessEditor } from "@input/pen-core";
import { afterEach, describe, expect, it } from "vitest";

import { FOCUS_SINK_ATTR, createFocusSink } from "../focusSink";
import { syncFocusSink } from "../syncFocusSink";
import { defaultSchema } from "@input/pen-schema-default";

const sinks: Array<{ dispose(): void }> = [];

function makeSink() {
	const sink = createFocusSink();
	sinks.push(sink);
	return sink;
}

afterEach(() => {
	for (const sink of sinks) {
		sink.dispose();
	}
	sinks.length = 0;
});

describe("syncFocusSink (AX1)", () => {
	it("AX1: block selection reveals the sink with a counted label", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const sink = makeSink();
		syncFocusSink(sink, editor, {
			type: "block",
			blockIds: ["a", "b", "c"],
		});

		expect(sink.element.getAttribute(FOCUS_SINK_ATTR)).toBe("");
		expect(sink.element.getAttribute("aria-hidden")).toBeNull();
		expect(sink.element.getAttribute("role")).toBe("group");
		expect(sink.element.getAttribute("aria-label")).toBe("3 blocks selected");
		editor.destroy();
	});

	it("AX1: cell selection reveals the sink with grid dimensions", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const sink = makeSink();
		syncFocusSink(sink, editor, {
			type: "cell",
			blockId: "table-1",
			anchor: { row: 0, col: 1 },
			head: { row: 1, col: 3 },
		});

		expect(sink.element.getAttribute("role")).toBe("grid");
		expect(sink.element.getAttribute("aria-label")).toBe(
			"2 by 3 cells selected",
		);
		editor.destroy();
	});

	it("AX1: text selection hides the sink", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const sink = makeSink();
		syncFocusSink(sink, editor, {
			type: "block",
			blockIds: ["a"],
		});
		syncFocusSink(sink, editor, {
			type: "text",
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "a", offset: 0 },
			isCollapsed: true,
			isMultiBlock: false,
			blockRange: ["a"],
			toRange: () => {
				throw new Error("unused");
			},
		});

		expect(sink.element.getAttribute("aria-hidden")).toBe("true");
		expect(sink.element.tabIndex).toBe(-1);
		editor.destroy();
	});

	it("AX1: empty-document text caret keeps the sink hidden", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const sink = makeSink();
		const first = editor.firstBlock();
		expect(first).not.toBeNull();
		editor.selectText(first!.id, 0, 0);
		syncFocusSink(sink, editor);

		expect(sink.element.getAttribute("aria-hidden")).toBe("true");
		expect(sink.element.tabIndex).toBe(-1);
		expect(sink.element.hasAttribute("role")).toBe(false);
		editor.destroy();
	});

	it("AX1: sink label comes from pen.messages, not a hardcoded string", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,
			messages: {
				"pen.a11y.blockSelectionEntered": {
					one: "TEST-sink-one {count}",
					other: "TEST-sink-other {count}",
				},
			},
		});
		const sink = makeSink();
		syncFocusSink(sink, editor, {
			type: "block",
			blockIds: ["a", "b", "c"],
		});

		expect(sink.element.getAttribute("aria-label")).toBe(
			"TEST-sink-other 3",
		);
		editor.destroy();
	});
});
