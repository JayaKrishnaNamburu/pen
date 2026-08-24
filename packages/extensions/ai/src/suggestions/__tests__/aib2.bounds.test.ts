import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { createModelDouble } from "@input/pen-test";
import {
	aiSuggestionsExtension,
	DEFAULT_MAX_SCOPE_CHARS,
	getAISuggestionsController,
} from "../index";

async function waitForCondition(
	check: () => boolean,
	maxTicks = 20,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (check()) {
			return;
		}
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Condition was not met in time.");
}

describe("AIB2 suggestions send bounds", () => {
	it("AIB2: a document far larger than DEFAULT_MAX_SCOPE_CHARS produces a request within that cap", async () => {
		const double = createModelDouble({
			responses: [{ text: JSON.stringify({ suggestions: [] }) }],
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					cooldownMs: 0,
					model: double,
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		const oversized = "A".repeat(DEFAULT_MAX_SCOPE_CHARS * 6);
		expect(oversized.length).toBeGreaterThan(DEFAULT_MAX_SCOPE_CHARS);

		editor.apply(
			[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: oversized }],
			{ origin: "user" },
		);

		const controller = getAISuggestionsController(editor);
		expect(controller?.request({ force: true })).toBe(true);
		await waitForCondition(() => double.requests.length === 1);

		const recorded = double.requests[0]!;
		expect(recorded.feature).toBe("suggestions");

		const target = recorded.documentExcerpts.filter(
			(excerpt) => excerpt.kind === "target",
		);
		expect(target).toHaveLength(1);
		expect(target[0]!.text.length).toBeLessThanOrEqual(
			DEFAULT_MAX_SCOPE_CHARS,
		);
		expect(target[0]!.text.length).toBeLessThan(oversized.length);

		const contextRadius = Math.floor(DEFAULT_MAX_SCOPE_CHARS / 2);
		for (const excerpt of recorded.documentExcerpts) {
			if (excerpt.kind === "context") {
				expect(excerpt.text.length).toBeLessThanOrEqual(contextRadius);
			}
		}

		const payload = JSON.parse(
			String(recorded.messages[1]?.content ?? "{}"),
		);
		expect(payload.targetText.length).toBeLessThanOrEqual(
			DEFAULT_MAX_SCOPE_CHARS,
		);
		expect(payload.contextBefore.length).toBeLessThanOrEqual(contextRadius);
		expect(payload.contextAfter.length).toBeLessThanOrEqual(contextRadius);
		expect(JSON.stringify(recorded)).not.toContain(oversized);

		editor.destroy();
	});
});
