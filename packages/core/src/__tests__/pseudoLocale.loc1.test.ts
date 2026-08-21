import { defaultSchema } from "./fixtures/testSchema";
import { DEFAULT_MESSAGE_CATALOG } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../editor/editor";
import { resolveEditorMessage } from "../i18n/resolveEditorMessage";
import {
	createPseudoLocaleCatalog,
	isPseudoLocaleText,
	PSEUDO_LOCALE_CLOSE,
	PSEUDO_LOCALE_OPEN,
} from "../i18n/pseudoLocale";

describe("pseudo-locale catalog (LOC1)", () => {
	it("LOC1: wraps every default catalog entry and keeps parameters", () => {
		const catalog = createPseudoLocaleCatalog();
		expect(catalog["pen.editor.label"]).toBe(
			`${PSEUDO_LOCALE_OPEN}Editor${PSEUDO_LOCALE_CLOSE}`,
		);
		expect(catalog["pen.ai.review.block"]).toBe(
			`${PSEUDO_LOCALE_OPEN}Block "{blockId}"${PSEUDO_LOCALE_CLOSE}`,
		);
		const blocks = catalog["pen.selection.blocksSelected"];
		expect(blocks).toMatchObject({
			one: `${PSEUDO_LOCALE_OPEN}{count} block selected${PSEUDO_LOCALE_CLOSE}`,
			other: `${PSEUDO_LOCALE_OPEN}{count} blocks selected${PSEUDO_LOCALE_CLOSE}`,
		});
	});

	it("LOC1: resolved chrome is transformed and longer than English", () => {
		const editor = createHeadlessEditor({
			schema: defaultSchema,messages: createPseudoLocaleCatalog(),
		});
		const label = resolveEditorMessage(editor, "pen.editor.label");
		expect(isPseudoLocaleText(label)).toBe(true);
		expect(label).not.toBe(DEFAULT_MESSAGE_CATALOG["pen.editor.label"]);
		expect(label.length).toBeGreaterThan(
			String(DEFAULT_MESSAGE_CATALOG["pen.editor.label"]).length,
		);
		expect(
			resolveEditorMessage(editor, "pen.ai.review.block", {
				blockId: "b1",
			}),
		).toBe(`${PSEUDO_LOCALE_OPEN}Block "b1"${PSEUDO_LOCALE_CLOSE}`);
		editor.destroy();
	});
});
