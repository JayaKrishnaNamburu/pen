import { defaultSchema } from "./fixtures/testSchema";
import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../editor/editor";
import { emptyDecorationSet } from "../editor/decorations";
import {
	beforeApplyFacet,
	clipboardFacet,
	commandsFacet,
	decorationsFacet,
	inputRulesFacet,
	keymapFacet,
	ariaReadOnlyFacet,
} from "../facets/coreFacets";
import {
	HOOK_PRIORITIES,
	hookPriorityToPrecedence,
	keyBindingPriorityToPrecedence,
	priorityToPrecedence,
} from "../facets/precedence";
import { createFacetRegistry } from "../facets/registry";

describe("core facets 1.3", () => {
	it("maps keyBinding and hook priority numbers onto precedence buckets", () => {
		expect(priorityToPrecedence(100)).toBe("highest");
		expect(priorityToPrecedence(200)).toBe("high");
		expect(priorityToPrecedence(300)).toBe("default");
		expect(priorityToPrecedence(500)).toBe("low");
		expect(priorityToPrecedence(501)).toBe("lowest");
		expect(keyBindingPriorityToPrecedence(100)).toBe("highest");
		expect(hookPriorityToPrecedence(HOOK_PRIORITIES.AUTH)).toBe("highest");
		expect(hookPriorityToPrecedence(HOOK_PRIORITIES.SUGGEST)).toBe("high");
		expect(hookPriorityToPrecedence(HOOK_PRIORITIES.INPUT_RULE)).toBe(
			"default",
		);
		expect(hookPriorityToPrecedence(HOOK_PRIORITIES.DEFAULT)).toBe("low");
	});

	it("R-inputRules / 1.3: pen.inputRules combine keeps registration order", () => {
		const first = {
			id: "slash",
			match: /\/$/,
			handler: () => [],
		};
		const second = {
			id: "gt",
			match: />$/,
			handler: () => [],
		};
		const registry = createFacetRegistry({
			providers: [inputRulesFacet.of(first), inputRulesFacet.of(second)],
		});
		registry.markReady();
		expect(registry.read(inputRulesFacet)).toEqual([first, second]);
	});

	it("1.3: pen.keymap flattens binding tables in R1 order", () => {
		const noop = () => false;
		const highest = [{ key: "Mod-Shift-Z", handler: noop }];
		const high = [{ key: "Mod-Z", handler: noop }];
		const registry = createFacetRegistry({
			providers: [
				keymapFacet.of(high, "high"),
				keymapFacet.of(highest, "highest"),
			],
		});
		registry.markReady();
		expect(registry.read(keymapFacet).map((binding) => binding.key)).toEqual([
			"Mod-Shift-Z",
			"Mod-Z",
		]);
	});

	it("1.3: pen.beforeApply / decorations / clipboard stay ordered lists", () => {
		const hookA = () => [];
		const hookB = () => [];
		const source = () => emptyDecorationSet();
		const handler = { id: "html" };
		const registry = createFacetRegistry({
			providers: [
				beforeApplyFacet.of(hookB, "low"),
				beforeApplyFacet.of(hookA, "highest"),
				decorationsFacet.of(source),
				clipboardFacet.of(handler),
			],
		});
		registry.markReady();
		expect(registry.read(beforeApplyFacet)).toEqual([hookA, hookB]);
		expect(registry.read(decorationsFacet)).toEqual([source]);
		expect(registry.read(clipboardFacet)).toEqual([handler]);
	});

	it("1.3: pen.commands groups handlers by command name", () => {
		const bold = { name: "bold" };
		const italic = { name: "italic" };
		const first = { command: bold, handler: () => false };
		const second = { command: italic, handler: () => false };
		const third = { command: bold, handler: () => false };
		const registry = createFacetRegistry({
			providers: [
				commandsFacet.of(first),
				commandsFacet.of(second),
				commandsFacet.of(third),
			],
		});
		registry.markReady();
		expect(registry.read(commandsFacet)).toEqual({
			bold: [first, third],
			italic: [second],
		});
	});

	it("1.3: pen.ariaReadOnly some-combines boolean inputs", () => {
		const empty = createFacetRegistry();
		empty.markReady();
		expect(empty.read(ariaReadOnlyFacet)).toBe(false);

		const mixed = createFacetRegistry({
			providers: [ariaReadOnlyFacet.of(false), ariaReadOnlyFacet.of(true)],
		});
		mixed.markReady();
		expect(mixed.read(ariaReadOnlyFacet)).toBe(true);
	});

	it("1.3: editor.facet and whenReady are wired on createHeadlessEditor", async () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		await editor.whenReady();
		expect(editor.facet(ariaReadOnlyFacet)).toBe(false);
		expect(editor.facet(keymapFacet)).toEqual([]);
		editor.destroy();
	});
});
