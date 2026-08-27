// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { afterEach, describe, expect, it } from "vitest";
import { mountEditor } from "../host/mountEditor";
import { DATA_ATTRS } from "../utils/dataAttributes";

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	document.body.replaceChildren();
});

/**
 * RI5 is a per-surface declaration, so the React conformance harness cannot
 * vouch for the framework-free host (HB5). Without this, dropping `whiteSpace`
 * from `documentTree.ts` leaves every gate green while stored newlines
 * collapse for vanilla hosts.
 */
describe("pen-dom RI5 text entry whitespace", () => {
	it("RI5: the inline content host carries pre-wrap", () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: { resolve: () => ({ extensions: [] }) },
		});
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
			root.remove();
		});

		const inline = root.querySelector(`[${DATA_ATTRS.inlineContent}]`);
		if (!(inline instanceof HTMLElement)) {
			throw new Error("Missing inline content host");
		}
		expect(inline.style.whiteSpace).toBe("pre-wrap");
	});
});
