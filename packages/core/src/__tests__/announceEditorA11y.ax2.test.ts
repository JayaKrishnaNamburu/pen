import {
	ANNOUNCER_SLOT_KEY,
	type A11yMessageKey,
	type EditorAnnouncer,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { defaultSchema } from "@input/pen-schema-default";
import {
	announceEditorA11y,
	createHeadlessEditor,
	resolveA11yBlockTypeLabel,
} from "../index";

const A11Y_KEY_COVERAGE: Record<A11yMessageKey, true> = {
	blockConverted: true,
	undoApplied: true,
	redoApplied: true,
	blockSelectionEntered: true,
	blockSelectionChanged: true,
	cellSelectionChanged: true,
	suggestionAppeared: true,
	suggestionAccepted: true,
	suggestionRejected: true,
	streamingStarted: true,
	streamingFinished: true,
	findMatches: true,
	atomSelected: true,
	collaboratorJoined: true,
	collaboratorEditing: true,
};

const A11Y_KEYS = Object.keys(A11Y_KEY_COVERAGE) as A11yMessageKey[];

describe("announceEditorA11y (AX2)", () => {
	it("AX2: no-ops when the announcer slot is empty", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		expect(() => {
			announceEditorA11y(editor, "streamingStarted");
		}).not.toThrow();
		editor.destroy();
	});

	it("AX2: resolves catalog copy through the announcer slot", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const seen: string[] = [];
		const announcer: EditorAnnouncer = {
			announce(message, _priority, key) {
				seen.push(`${key}:${message}`);
			},
		};
		editor.internals.assignSlot(ANNOUNCER_SLOT_KEY, announcer);

		announceEditorA11y(editor, "blockConverted", { blockType: "Heading" });
		expect(seen).toEqual(["blockConverted:Converted to Heading"]);
		editor.destroy();
	});

	it("AX2: every A11yMessageKey is announced by name", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const keys: string[] = [];
		editor.internals.assignSlot(ANNOUNCER_SLOT_KEY, {
			announce(_message, _priority, key) {
				if (key) {
					keys.push(key);
				}
			},
		} satisfies EditorAnnouncer);

		announceEditorA11y(editor, "blockConverted", { blockType: "Heading" });
		announceEditorA11y(editor, "undoApplied", { hint: "Paragraph" });
		announceEditorA11y(editor, "redoApplied", { hint: "Paragraph" });
		announceEditorA11y(editor, "blockSelectionEntered", { count: 1 });
		announceEditorA11y(editor, "blockSelectionChanged", { count: 2 });
		announceEditorA11y(editor, "cellSelectionChanged", {
			rows: 1,
			columns: 2,
		});
		announceEditorA11y(editor, "suggestionAppeared");
		announceEditorA11y(editor, "suggestionAccepted");
		announceEditorA11y(editor, "suggestionRejected");
		announceEditorA11y(editor, "streamingStarted");
		announceEditorA11y(editor, "streamingFinished");
		announceEditorA11y(editor, "findMatches", { count: 3 });
		announceEditorA11y(editor, "atomSelected", { atomType: "mention" });
		announceEditorA11y(editor, "collaboratorJoined", { name: "Ada" });
		announceEditorA11y(editor, "collaboratorEditing", { name: "Ada" });

		expect(keys).toEqual([...A11Y_KEYS]);
		editor.destroy();
	});

	it("AX2: schema titles win over raw block type ids", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		expect(resolveA11yBlockTypeLabel(editor, "heading")).toBe("Heading");
		expect(resolveA11yBlockTypeLabel(editor, "customBlock")).toBe(
			"customBlock",
		);
		editor.destroy();
	});
});
