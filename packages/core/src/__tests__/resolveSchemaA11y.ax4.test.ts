import { describe, expect, it } from "vitest";

import { defaultSchema } from "./fixtures/testSchema";
import {
	A11Y_MISSING_LABEL_CODE,
	createHeadlessEditor,
	resolveSchemaA11y,
} from "../index";

describe("resolveSchemaA11y (AX4)", () => {
	it("AX4: unlabeled types fall back to the type name once per session", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const codes: string[] = [];
		editor.on("diagnostic", (event) => {
			if (event.code === A11Y_MISSING_LABEL_CODE) {
				codes.push(String(event.type ?? ""));
			}
		});

		expect(
			resolveSchemaA11y(editor, {
				kind: "inline",
				type: "unknownAtom",
				props: {},
			}),
		).toEqual({ label: "unknownAtom" });
		expect(
			resolveSchemaA11y(editor, {
				kind: "inline",
				type: "unknownAtom",
				props: {},
			}),
		).toEqual({ label: "unknownAtom" });
		expect(codes).toEqual(["unknownAtom"]);
		editor.destroy();
	});

	it("AX4: default image and mention specs resolve through the editor schema", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		expect(
			resolveSchemaA11y(editor, {
				kind: "block",
				type: "image",
				props: { alt: "Harbor" },
			}),
		).toEqual({ label: "Harbor", roleDescription: "image" });
		expect(
			resolveSchemaA11y(editor, {
				kind: "inline",
				type: "mention",
				props: { label: "Ada" },
			}),
		).toEqual({ label: "@Ada", roleDescription: "mention" });
		editor.destroy();
	});
});
