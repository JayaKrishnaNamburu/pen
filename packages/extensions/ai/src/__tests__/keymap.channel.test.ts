import {
	createEditor,
	defineExtension,
	keyBindingPriorityToPrecedence,
	keymapFacet,
} from "@input/pen-core";
import { deltaStreamExtension } from "@input/pen-delta-stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { COLLECT_KEY_BINDINGS_SLOT_KEY } from "@input/pen-types";
import type { Editor, KeyBinding, SchemaRegistry } from "@input/pen-types";
import { undoExtension } from "@input/pen-undo";
import { describe, expect, it } from "vitest";
import { aiExtension } from "../index";

const AI_INLINE_SHORTCUTS = [
	{
		key: "Mod-z",
		priority: 1000,
		description: "pen.ai.shortcut.undoInline",
	},
	{
		key: "Mod-Shift-z",
		priority: 1000,
		description: "pen.ai.shortcut.redoInline",
	},
	{
		key: "Ctrl-y",
		priority: 1000,
		description: "pen.ai.shortcut.redoInline",
	},
] as const;

function collectBindings(editor: Editor): readonly KeyBinding[] {
	const collect = editor.internals.getSlot<
		(registry: SchemaRegistry) => readonly KeyBinding[]
	>(COLLECT_KEY_BINDINGS_SLOT_KEY);
	return collect?.(editor.schema) ?? [];
}

function createAIEditor(extra: ReturnType<typeof defineExtension>[] = []) {
	const extension = aiExtension();
	const editor = createEditor({
		schema: defaultSchema,
		extensions: [
			...extra,
			undoExtension(),
			deltaStreamExtension(),
			documentOpsExtension(),
			extension,
		],
	});
	return { editor, extension };
}

function aiShortcutBindings(bindings: readonly KeyBinding[]): KeyBinding[] {
	return bindings.filter((binding) =>
		AI_INLINE_SHORTCUTS.some(
			(shortcut) =>
				shortcut.key === binding.key &&
				shortcut.description === binding.description,
		),
	);
}

describe("ai keymap channel", () => {
	it("declares inline-history shortcuts on keymapFacet, not Extension.keyBindings", () => {
		const { editor, extension } = createAIEditor();
		const lifted = aiShortcutBindings(editor.facet(keymapFacet));

		expect(extension.keyBindings).toBeUndefined();
		expect(lifted).toHaveLength(3);
		expect(
			lifted.map((binding) => ({
				key: binding.key,
				priority: binding.priority,
				description: binding.description,
			})),
		).toEqual([...AI_INLINE_SHORTCUTS]);
		for (const binding of lifted) {
			expect(collectBindings(editor)).toContain(binding);
		}
		editor.destroy();
	});

	it("maps each binding priority through keyBindingPriorityToPrecedence", () => {
		const { editor } = createAIEditor();
		const lifted = aiShortcutBindings(editor.facet(keymapFacet));

		expect(lifted).toHaveLength(3);
		for (const binding of lifted) {
			expect(binding.priority).toBe(1000);
			expect(
				keyBindingPriorityToPrecedence(binding.priority ?? 300),
			).toBe("lowest");
		}
		editor.destroy();
	});

	it("places AI lowest-precedence bindings after a native lowest-precedence keymapFacet.of()", () => {
		const nativeBinding: KeyBinding = {
			key: "Mod-k",
			handler: () => false,
		};
		const native = defineExtension({
			name: "native-keymap",
			facets: [keymapFacet.of([nativeBinding], "lowest")],
		});
		const { editor } = createAIEditor([native]);
		const keys = editor.facet(keymapFacet);
		const firstAI = aiShortcutBindings(keys)[0];

		expect(firstAI).toBeTruthy();
		expect(keys.indexOf(nativeBinding)).toBeGreaterThanOrEqual(0);
		expect(keys.indexOf(firstAI!)).toBeGreaterThan(
			keys.indexOf(nativeBinding),
		);
		editor.destroy();
	});
});
