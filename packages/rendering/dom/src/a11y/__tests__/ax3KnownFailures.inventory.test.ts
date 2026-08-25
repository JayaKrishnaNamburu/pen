import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHeadlessEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";

import { getInsertSiblingBlockOp } from "../../utils/parentIdTree";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOM_SRC = join(HERE, "../..");
const RENDERING = join(DOM_SRC, "../..");
const PACKAGES = join(RENDERING, "..");

const SLASH_MENU = join(RENDERING, "react/src/hooks/useSlashMenu.ts");
const CONTENT_EDITABLE = join(
	DOM_SRC,
	"field-editor/contenteditableBackendCore.ts",
);
const AUTOCOMPLETE_ACCEPT = join(
	PACKAGES,
	"extensions/ai/src/autocomplete/autocompleteControllerLifecycle.ts",
);
const SCHEDULER = join(DOM_SRC, "scheduler.ts");

const editors: Array<ReturnType<typeof createHeadlessEditor>> = [];

afterEach(() => {
	while (editors.length > 0) {
		void editors.pop()?.destroy();
	}
});

describe("AX3 previously-reclassified bugs (rechecked, not trusted)", () => {
	it("slash leftover query still reproduces: /head takes sibling-insert and is not deleted", () => {
		const source = readFileSync(SLASH_MENU, "utf8");
		expect(source).toContain(
			'currentText.length === 0 || currentText === "/"',
		);
		expect(source).toMatch(/if\s*\(\s*currentText === "\/"\s*\)/);
		expect(source).toContain('text.startsWith("/")');

		const editor = createHeadlessEditor({ schema: defaultSchema });
		editors.push(editor);
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "/head" },
		]);
		editor.selectText(blockId, 5, 5);

		// confirm() on a filtered query takes this branch (useSlashMenu ~174–188)
		editor.apply([
			getInsertSiblingBlockOp(editor, {
				siblingBlockId: blockId,
				blockId: "ax3-heading",
				blockType: "heading",
				props: { level: 1 },
			}),
		]);

		expect(editor.getBlock(blockId)?.textContent()).toBe("/head");
		expect(editor.getBlock("ax3-heading")?.type).toBe("heading");
		// getSlashTarget (~246) still matches; the listbox reopens if
		// selection stays on the leftover paragraph.
		expect(editor.getBlock(blockId)?.textContent()?.startsWith("/")).toBe(
			true,
		);
	});

	it("autocomplete caret: updateSelection is no longer a no-op; projector slot runs P1", () => {
		const backend = readFileSync(CONTENT_EDITABLE, "utf8");
		expect(backend).toMatch(
			/updateSelection\([^)]*\)\s*:\s*void\s*\{\s*this\.restoreDOMSelectionFromEditor\(\);/,
		);

		const accept = readFileSync(AUTOCOMPLETE_ACCEPT, "utf8");
		expect(accept).toContain("controller._editor.selectText(");
		expect(accept).toContain("commitProgrammaticTextSelection");

		const scheduler = readFileSync(SCHEDULER, "utf8");
		expect(scheduler).toMatch(/this\.onProjectSelection\?\.\(record\)/);
		expect(scheduler).not.toMatch(
			/private projectSelection\(\): void \{\s*\}/,
		);
	});
});
