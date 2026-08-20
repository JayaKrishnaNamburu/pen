import { defaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../editor/editor";
import { getInlineCompletionController } from "../editor/inlineCompletion";
import {
	SLOT_DEPRECATED_CODE,
	SLOT_DISPOSITION_BY_KEY,
} from "../facets/slotAdapter";

describe("SM1 slot adapter", () => {
	it("SM1: every table row resolves through getSlot and emits slot-deprecated once per key", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const codes: string[] = [];
		editor.on("diagnostic", (event) => {
			if (event.code === SLOT_DEPRECATED_CODE) {
				codes.push(String((event as { key?: string }).key ?? event.message));
			}
		});

		for (const [key, disposition] of Object.entries(SLOT_DISPOSITION_BY_KEY)) {
			if (disposition.kind === "whenReady") {
				const awaitReady = editor.internals.getSlot<() => Promise<void>>(key);
				expect(typeof awaitReady).toBe("function");
				continue;
			}
			if (disposition.kind === "engine") {
				expect(editor.internals.getSlot(key)).toBe(editor.internals.engine);
				continue;
			}
			if (disposition.kind === "parked" || disposition.kind === "keymapCollector") {
				editor.internals.setSlot(key, { key });
				expect(editor.internals.getSlot(key)).toEqual({ key });
				editor.internals.setSlot(key, { key });
				continue;
			}

			const value = { key };
			editor.internals.setSlot(key, value);
			expect(editor.internals.getSlot(key)).toBe(value);
			expect(editor.facet(disposition.facet)).toBe(value);
			editor.internals.setSlot(key, value);
		}

		const deprecatedKeys = codes.filter((key) =>
			Object.keys(SLOT_DISPOSITION_BY_KEY).includes(key),
		);
		const unique = new Set(deprecatedKeys);
		expect(unique.size).toBe(deprecatedKeys.length);

		const expected = Object.entries(SLOT_DISPOSITION_BY_KEY)
			.filter(
				([, disposition]) =>
					disposition.kind === "facet" || disposition.kind === "keymapCollector",
			)
			.map(([key]) => key);
		expect([...unique].sort()).toEqual(expected.sort());
		editor.destroy();
	});

	it("SM3: setSlot remains only as the deprecation adapter beside assignSlot", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		expect(typeof editor.internals.setSlot).toBe("function");
		expect(typeof editor.internals.assignSlot).toBe("function");
		editor.destroy();
	});

	it("SM2: public accessors resolve the mapped controller facet", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const controller = { kind: "inline-completion" };
		editor.internals.assignSlot("ai:inline-completion", controller);
		expect(getInlineCompletionController(editor)).toBe(controller);
		expect(editor.facet).toBeTypeOf("function");
		editor.destroy();
	});
});
