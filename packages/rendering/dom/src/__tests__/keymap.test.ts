import { describe, expect, it } from "vitest";

import {
	resolveKeymap,
	type KeymapBinding,
	type KeymapEvent,
} from "../field-editor/keymap";

function event(
	key: string,
	mods: Omit<KeymapEvent, "key"> = {},
): KeymapEvent {
	return {
		key,
		altKey: mods.altKey ?? false,
		ctrlKey: mods.ctrlKey ?? false,
		metaKey: mods.metaKey ?? false,
		shiftKey: mods.shiftKey ?? false,
	};
}

function binding(key: string, name: string): KeymapBinding {
	return { key, command: { name } };
}

const caretBindings: readonly KeymapBinding[] = [
	binding("Shift-ArrowLeft", "pen.caretLeft.extend"),
	binding("ArrowLeft", "pen.caretLeft"),
	binding("ArrowRight", "pen.caretRight"),
	binding("Escape", "pen.cancel"),
];

describe("resolveKeymap", () => {
	it("K1: matches the first binding in facet order", () => {
		const bindings = [
			binding("ArrowLeft", "high.caretLeft"),
			binding("ArrowLeft", "default.caretLeft"),
			binding("ArrowRight", "pen.caretRight"),
		];

		expect(
			resolveKeymap(bindings, event("ArrowLeft"), { composing: false }),
		).toBe("high.caretLeft");
		expect(
			resolveKeymap(bindings, event("ArrowRight"), { composing: false }),
		).toBe("pen.caretRight");
	});

	it("K1: returns null when no binding matches", () => {
		expect(
			resolveKeymap(caretBindings, event("a"), { composing: false }),
		).toBeNull();
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft", { altKey: true }), {
				composing: false,
			}),
		).toBeNull();
	});

	it("K1: Shift-ArrowLeft is distinct from ArrowLeft", () => {
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft", { shiftKey: true }), {
				composing: false,
			}),
		).toBe("pen.caretLeft.extend");
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft"), { composing: false }),
		).toBe("pen.caretLeft");
	});

	it("K1: direction resolver is identity until wave-6", () => {
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft"), {
				composing: false,
				direction: "rtl",
			}),
		).toBe("pen.caretLeft");
		expect(
			resolveKeymap(caretBindings, event("ArrowRight"), {
				composing: false,
				direction: "rtl",
			}),
		).toBe("pen.caretRight");
	});

	it("K4: during composition only Escape matches", () => {
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft"), { composing: true }),
		).toBeNull();
		expect(
			resolveKeymap(caretBindings, event("ArrowRight"), { composing: true }),
		).toBeNull();
		expect(
			resolveKeymap(caretBindings, event("a"), { composing: true }),
		).toBeNull();
		expect(
			resolveKeymap(caretBindings, event("Escape"), { composing: true }),
		).toBe("pen.cancel");
	});

	it("K4: unbound Escape during composition still returns null", () => {
		expect(
			resolveKeymap(
				[binding("ArrowLeft", "pen.caretLeft")],
				event("Escape"),
				{ composing: true },
			),
		).toBeNull();
	});
});
