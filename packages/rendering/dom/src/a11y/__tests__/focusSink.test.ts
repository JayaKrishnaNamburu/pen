// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { FOCUS_SINK_ATTR, createFocusSink } from "../focusSink";

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

describe("createFocusSink (AX1)", () => {
	it("AX1: starts aria-hidden and out of the tab order", () => {
		const sink = makeSink();

		expect(sink.element.getAttribute(FOCUS_SINK_ATTR)).toBe("");
		expect(sink.element.getAttribute("aria-hidden")).toBe("true");
		expect(sink.element.tabIndex).toBe(-1);
		expect(sink.element.hasAttribute("role")).toBe(false);
		expect(sink.element.hasAttribute("aria-label")).toBe(false);
	});

	it("AX1: reveal(block) enters tab order with role and label", () => {
		const sink = makeSink();
		sink.reveal({ kind: "block", label: "3 blocks selected" });

		expect(sink.element.getAttribute("aria-hidden")).toBeNull();
		expect(sink.element.tabIndex).toBe(0);
		expect(sink.element.getAttribute("role")).toBe("group");
		expect(sink.element.getAttribute("aria-label")).toBe(
			"3 blocks selected",
		);
	});

	it("AX1: reveal(cell) enters tab order with role and label", () => {
		const sink = makeSink();
		sink.reveal({ kind: "cell", label: "2 by 3 cells selected" });

		expect(sink.element.getAttribute("aria-hidden")).toBeNull();
		expect(sink.element.tabIndex).toBe(0);
		expect(sink.element.getAttribute("role")).toBe("grid");
		expect(sink.element.getAttribute("aria-label")).toBe(
			"2 by 3 cells selected",
		);
	});

	it("AX1: hide() restores aria-hidden and drops role and label", () => {
		const sink = makeSink();
		sink.reveal({ kind: "block", label: "1 block selected" });
		sink.hide();

		expect(sink.element.getAttribute("aria-hidden")).toBe("true");
		expect(sink.element.tabIndex).toBe(-1);
		expect(sink.element.hasAttribute("role")).toBe(false);
		expect(sink.element.hasAttribute("aria-label")).toBe(false);
	});

	it("AX7: overlay stays presentation; the sink is the selection surface", () => {
		const sink = makeSink();

		expect(sink.element.getAttribute("aria-hidden")).toBe("true");

		sink.reveal({ kind: "block", label: "4 blocks selected" });

		expect(sink.element.getAttribute("aria-hidden")).toBeNull();
		expect(sink.element.getAttribute("role")).toBe("group");
		expect(sink.element.getAttribute("aria-label")).toBe(
			"4 blocks selected",
		);
	});

	it("AX7: cell selection is exposed on the sink, not as overlay semantics", () => {
		const sink = makeSink();
		sink.reveal({ kind: "cell", label: "1 by 2 cells selected" });

		expect(sink.element.getAttribute("aria-hidden")).toBeNull();
		expect(sink.element.getAttribute("role")).toBe("grid");
		expect(sink.element.getAttribute("aria-label")).toBe(
			"1 by 2 cells selected",
		);
	});
});
