import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { aiExtension, getAIController } from "../index";

describe("aiExtension", () => {
	it("keeps the controller state snapshot stable for no-op updates", () => {
		const editor = createEditor({
			extensions: [aiExtension()],
		});

		const controller = getAIController(editor)!;
		const initialState = controller.getState();

		controller.setSuggestMode(false);
		expect(controller.getState()).toBe(initialState);

		controller.closeCommandMenu();
		expect(controller.getState()).toBe(initialState);

		controller.dismissEphemeralSuggestion();
		expect(controller.getState()).toBe(initialState);
	});
});
