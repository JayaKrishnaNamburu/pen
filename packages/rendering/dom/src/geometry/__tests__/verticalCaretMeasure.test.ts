// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
	createEditor,
	getVerticalCaretMeasure,
	setVerticalCaretMeasure,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { Editor } from "@input/pen-types";
import { getRootGeometry } from "../rootGeometry";
import { registerVerticalCaretMeasure } from "../verticalCaretMeasure";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor(): Editor {
	return createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
}

describe("registerVerticalCaretMeasure", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("registers a measure that runs through measureNow", () => {
		const editor = createBareEditor();
		const root = document.createElement("div");
		document.body.append(root);
		const host = getRootGeometry(root, {
			observeResize: false,
			observeFonts: false,
		});
		const unregister = registerVerticalCaretMeasure(editor, root);
		const measure = getVerticalCaretMeasure(editor);
		expect(measure).toEqual(expect.any(Function));
		expect(host.scheduler.diagnostics.measureNowCount).toBe(0);

		measure?.(editor, { blockId: "missing", offset: 0 }, "down", null);
		expect(host.scheduler.diagnostics.measureNowCount).toBe(1);

		unregister();
		editor.destroy();
	});

	it("clears the seam when unregistered", () => {
		const editor = createBareEditor();
		const root = document.createElement("div");
		document.body.append(root);
		const unregister = registerVerticalCaretMeasure(editor, root);
		unregister();
		expect(getVerticalCaretMeasure(editor)).toBeUndefined();
		setVerticalCaretMeasure(editor, null);
		editor.destroy();
	});
});
