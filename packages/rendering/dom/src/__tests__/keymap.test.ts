import { describe, expect, it } from "vitest";

import {
	resolveKeymap,
	type KeymapBinding,
	type KeymapEvent,
} from "../field-editor/keymap";

function event(key: string, mods: Omit<KeymapEvent, "key"> = {}): KeymapEvent {
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

const directedMotionBindings: readonly KeymapBinding[] = [
	binding("Shift-ArrowLeft", "pen.caretLeft"),
	binding("ArrowLeft", "pen.caretLeft"),
	binding("Shift-ArrowRight", "pen.caretRight"),
	binding("ArrowRight", "pen.caretRight"),
	binding("Shift-Alt-ArrowLeft", "pen.caretWordLeft"),
	binding("Alt-ArrowLeft", "pen.caretWordLeft"),
	binding("Shift-Alt-ArrowRight", "pen.caretWordRight"),
	binding("Alt-ArrowRight", "pen.caretWordRight"),
	binding("Shift-Ctrl-ArrowLeft", "pen.caretWordLeft"),
	binding("Ctrl-ArrowLeft", "pen.caretWordLeft"),
	binding("Shift-Ctrl-ArrowRight", "pen.caretWordRight"),
	binding("Ctrl-ArrowRight", "pen.caretWordRight"),
	binding("Shift-ArrowUp", "pen.caretUp"),
	binding("ArrowUp", "pen.caretUp"),
	binding("Shift-ArrowDown", "pen.caretDown"),
	binding("ArrowDown", "pen.caretDown"),
	binding("Backspace", "pen.deleteBackward"),
	binding("Delete", "pen.deleteForward"),
	binding("Alt-Backspace", "pen.deleteBackward"),
	binding("Alt-Delete", "pen.deleteForward"),
	binding("Ctrl-Backspace", "pen.deleteBackward"),
	binding("Ctrl-Delete", "pen.deleteForward"),
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
			resolveKeymap(
				caretBindings,
				event("ArrowLeft", { shiftKey: true }),
				{
					composing: false,
				},
			),
		).toBe("pen.caretLeft.extend");
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft"), {
				composing: false,
			}),
		).toBe("pen.caretLeft");
	});

	it("K4: during composition only Escape matches", () => {
		expect(
			resolveKeymap(caretBindings, event("ArrowLeft"), {
				composing: true,
			}),
		).toBeNull();
		expect(
			resolveKeymap(caretBindings, event("ArrowRight"), {
				composing: true,
			}),
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

	it("M2: rtl swaps ArrowLeft/ArrowRight with and without Shift", () => {
		const rtl = { composing: false, direction: "rtl" as const };

		expect(
			resolveKeymap(directedMotionBindings, event("ArrowLeft"), rtl),
		).toBe("pen.caretRight");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowLeft", { shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretRight");
		expect(
			resolveKeymap(directedMotionBindings, event("ArrowRight"), rtl),
		).toBe("pen.caretLeft");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowRight", { shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretLeft");
	});

	it("M2: rtl swaps both word-left and word-right variants", () => {
		const rtl = { composing: false, direction: "rtl" as const };

		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowLeft", { altKey: true }),
				rtl,
			),
		).toBe("pen.caretWordRight");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowLeft", { altKey: true, shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretWordRight");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowRight", { altKey: true }),
				rtl,
			),
		).toBe("pen.caretWordLeft");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowRight", { altKey: true, shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretWordLeft");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowLeft", { ctrlKey: true }),
				rtl,
			),
		).toBe("pen.caretWordRight");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowLeft", { ctrlKey: true, shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretWordRight");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowRight", { ctrlKey: true }),
				rtl,
			),
		).toBe("pen.caretWordLeft");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowRight", { ctrlKey: true, shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretWordLeft");
	});

	it("M2: ltr and omitted direction leave caret commands unswapped", () => {
		expect(
			resolveKeymap(directedMotionBindings, event("ArrowLeft"), {
				composing: false,
				direction: "ltr",
			}),
		).toBe("pen.caretLeft");
		expect(
			resolveKeymap(directedMotionBindings, event("ArrowRight"), {
				composing: false,
			}),
		).toBe("pen.caretRight");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowLeft", { altKey: true }),
				{ composing: false, direction: "ltr" },
			),
		).toBe("pen.caretWordLeft");
	});

	it("M2: remaps the matched command, not the key before match", () => {
		const bindings = [
			binding("ArrowLeft", "pen.caretLeft"),
			binding("ArrowRight", "extension.onlyOnRight"),
		];

		expect(
			resolveKeymap(bindings, event("ArrowLeft"), {
				composing: false,
				direction: "rtl",
			}),
		).toBe("pen.caretRight");
		expect(
			resolveKeymap(bindings, event("ArrowRight"), {
				composing: false,
				direction: "rtl",
			}),
		).toBe("extension.onlyOnRight");
	});

	it("M5: rtl does not swap vertical caret commands", () => {
		const rtl = { composing: false, direction: "rtl" as const };

		expect(
			resolveKeymap(directedMotionBindings, event("ArrowUp"), rtl),
		).toBe("pen.caretUp");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowUp", { shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretUp");
		expect(
			resolveKeymap(directedMotionBindings, event("ArrowDown"), rtl),
		).toBe("pen.caretDown");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("ArrowDown", { shiftKey: true }),
				rtl,
			),
		).toBe("pen.caretDown");
	});

	it("M6: rtl does not swap deletion commands", () => {
		const rtl = { composing: false, direction: "rtl" as const };

		expect(
			resolveKeymap(directedMotionBindings, event("Backspace"), rtl),
		).toBe("pen.deleteBackward");
		expect(
			resolveKeymap(directedMotionBindings, event("Delete"), rtl),
		).toBe("pen.deleteForward");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("Backspace", { altKey: true }),
				rtl,
			),
		).toBe("pen.deleteBackward");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("Delete", { altKey: true }),
				rtl,
			),
		).toBe("pen.deleteForward");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("Backspace", { ctrlKey: true }),
				rtl,
			),
		).toBe("pen.deleteBackward");
		expect(
			resolveKeymap(
				directedMotionBindings,
				event("Delete", { ctrlKey: true }),
				rtl,
			),
		).toBe("pen.deleteForward");
	});
});
