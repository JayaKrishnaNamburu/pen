// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRootGeometry } from "../../geometry/rootGeometry";
import { mountEditor } from "../../host/mountEditor";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { FieldEditorImpl } from "../fieldEditorImpl";

const cleanups: Array<() => void> = [];

beforeEach(() => {
	// acceptCommit schedules a flush; keep the frame from running so the
	// assertions count the feed itself rather than what a flush does with it.
	vi.stubGlobal("requestAnimationFrame", (): number => 1);
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

function createRoot(): HTMLElement {
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	document.body.append(root);
	return root;
}

function typeInto(editor: ReturnType<typeof createEditor>, text: string): void {
	const blockId = editor.firstBlock()!.id;
	editor.apply([{ type: "splice-text", blockId, from: 0, to: 0, insert: text }]);
}

describe("FE4 commit feed", () => {
	it("feeds the root scheduler from a bare field editor, as the bindings build it", () => {
		const editor = createEditor({ schema: defaultSchema });
		const root = createRoot();
		const fieldEditor = new FieldEditorImpl(editor);
		fieldEditor.setRootElement(root);
		cleanups.push(() => {
			fieldEditor.destroy();
			editor.destroy();
		});

		const acceptCommit = vi.spyOn(
			getRootGeometry(root).scheduler,
			"acceptCommit",
		);
		typeInto(editor, "abc");

		expect(acceptCommit).toHaveBeenCalledTimes(1);
	});

	it("feeds the root scheduler from the vanilla mount", () => {
		const editor = createEditor({ schema: defaultSchema });
		const root = createRoot();
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		const acceptCommit = vi.spyOn(
			getRootGeometry(root).scheduler,
			"acceptCommit",
		);
		typeInto(editor, "abc");

		expect(acceptCommit).toHaveBeenCalledTimes(1);
	});

	it("hands the scheduler the commit that named the edited blocks", () => {
		const editor = createEditor({ schema: defaultSchema });
		const root = createRoot();
		const fieldEditor = new FieldEditorImpl(editor);
		fieldEditor.setRootElement(root);
		cleanups.push(() => {
			fieldEditor.destroy();
			editor.destroy();
		});

		const acceptCommit = vi.spyOn(
			getRootGeometry(root).scheduler,
			"acceptCommit",
		);
		const blockId = editor.firstBlock()!.id;
		typeInto(editor, "abc");

		const event = acceptCommit.mock.calls[0]?.[0];
		expect(event?.summary.affectedBlockIds).toContain(blockId);
	});

	it("survives commits that land before a root is attached", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new FieldEditorImpl(editor);
		cleanups.push(() => {
			fieldEditor.destroy();
			editor.destroy();
		});

		expect(() => typeInto(editor, "abc")).not.toThrow();
	});

	it("stops feeding once the field editor is destroyed", () => {
		const editor = createEditor({ schema: defaultSchema });
		const root = createRoot();
		const fieldEditor = new FieldEditorImpl(editor);
		fieldEditor.setRootElement(root);
		cleanups.push(() => editor.destroy());

		const acceptCommit = vi.spyOn(
			getRootGeometry(root).scheduler,
			"acceptCommit",
		);
		fieldEditor.destroy();
		typeInto(editor, "abc");

		expect(acceptCommit).not.toHaveBeenCalled();
	});
});
