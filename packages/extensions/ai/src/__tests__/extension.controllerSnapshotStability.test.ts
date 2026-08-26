import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { aiExtension, getAIController } from "../index";
import { defaultSchema } from "@input/pen-schema-default";

describe("aiExtension", () => {
	it("keeps the controller state snapshot stable for no-op updates", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension(),
			],
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
