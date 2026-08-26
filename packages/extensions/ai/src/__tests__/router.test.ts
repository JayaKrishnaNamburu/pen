import { describe, expect, it } from "vitest";
import {
	AI_ANNOTATED_WORKING_SET_MAX_BLOCKS,
	refineRouteWithNavigator,
	routeAIRequest,
} from "../runtime/router";

describe("ai request router", () => {
	it("routes continuation prompts to cursor-context by default", () => {
		const route = routeAIRequest({
			prompt: "Continue this paragraph",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "text",
		});

		expect(route.lane).toBe("cursor-context");
		expect(route.mutationMode).toBe("direct-stream");
		expect(route.applyStrategy).toBe("text-fast-apply");
		expect(route.targetKind).toBe("block");
		expect(route.blockClass).toBe("flow");
		expect(route.adapterId).toBe("flow-markdown");
		expect(route.transportKind).toBe("flow-text");
		expect(route.confidence).toBeGreaterThan(0.8);
	});

	it("reroutes structural blocks away from cursor-context when navigator confidence is low", () => {
		const initialRoute = routeAIRequest({
			prompt: "Continue this table",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "text",
		});

		const refinedRoute = refineRouteWithNavigator(initialRoute, {
			activeBlockType: "table",
			selectedTextLength: 0,
		});

		expect(initialRoute.lane).toBe("cursor-context");
		expect(refinedRoute.lane).toBe("tool-loop");
		expect(refinedRoute.applyStrategy).toBe("tool-edit");
		expect(refinedRoute.targetKind).toBe("table");
		expect(refinedRoute.contentFormat).toBe("markdown");
		expect(refinedRoute.adapterId).toBe("flow-markdown");
		expect(refinedRoute.confidence).toBeLessThan(initialRoute.confidence);
	});

	it("buffers markdown block generations even on cursor-context routes", () => {
		const route = routeAIRequest({
			prompt: "Continue this paragraph",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
		});

		expect(route.lane).toBe("cursor-context");
		expect(route.mutationMode).toBe("direct-stream");
		expect(route.applyStrategy).toBe("markdown-full-replace");
		expect(route.shouldStreamDirectly).toBe(false);
	});

	it("routes bottom-chat block writing through the tool loop", () => {
		const route = routeAIRequest({
			prompt: "Write a short story about the sea",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
			surface: "bottom-chat",
		});

		expect(route.lane).toBe("tool-loop");
		expect(route.mutationMode).toBe("persistent-suggestions");
		expect(route.applyStrategy).toBe("tool-edit");
		expect(route.shouldStreamDirectly).toBe(false);
	});

	it("routes table targets through the markdown adapter", () => {
		const route = routeAIRequest({
			prompt: "Add a row to this table",
			selection: null,
			blockType: "table",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "text",
		});

		expect(route.targetKind).toBe("table");
		expect(route.applyStrategy).toBe("tool-edit");
		expect(route.contentFormat).toBe("markdown");
		expect(route.blockClass).toBe("flow");
		expect(route.adapterId).toBe("flow-markdown");
		expect(route.transportKind).toBe("flow-text");
		expect(route.allowToolUse).toBe(true);
	});

	it("infers table target kind from blank-document creation prompts", () => {
		const route = routeAIRequest({
			prompt: "Create a table with names",
			selection: null,
			blockType: "paragraph",
			blockCount: 1,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
			surface: "bottom-chat",
		});

		expect(route.lane).toBe("tool-loop");
		expect(route.targetKind).toBe("table");
		expect(route.mutationMode).toBe("streaming-suggestions");
		expect(route.applyStrategy).toBe("tool-edit");
		expect(route.contentFormat).toBe("markdown");
		expect(route.blockClass).toBe("flow");
		expect(route.adapterId).toBe("flow-markdown");
		expect(route.transportKind).toBe("flow-text");
		expect(route.shouldStreamDirectly).toBe(false);
	});

	// spec/packages/extensions/ai.md EC12
	it("EC12: durable document edits take the tool loop and tool-edit strategy", () => {
		const table = routeAIRequest({
			prompt: "Create a table with names",
			selection: null,
			blockType: "paragraph",
			blockCount: 1,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
			surface: "bottom-chat",
		});
		expect(table.lane).toBe("tool-loop");
		expect(table.allowToolUse).toBe(true);
		expect(table.applyStrategy).toBe("tool-edit");

		const improve = routeAIRequest({
			prompt: "Improve the text and make the last bit a bullet.",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
		});
		expect(improve.lane).toBe("tool-loop");
		expect(improve.applyStrategy).toBe("tool-edit");
	});

	it("sends durable edits through the tool loop regardless of document size", () => {
		const input = {
			prompt: "Improve the text and make the last bit a bullet.",
			selection: null,
			blockType: "paragraph",
			suggestMode: false,
			target: "block" as const,
			contentFormat: "markdown" as const,
		};

		expect(
			routeAIRequest({
				...input,
				blockCount: AI_ANNOTATED_WORKING_SET_MAX_BLOCKS,
			}).lane,
		).toBe("tool-loop");

		expect(
			routeAIRequest({
				...input,
				blockCount: AI_ANNOTATED_WORKING_SET_MAX_BLOCKS + 1,
			}).lane,
		).toBe("tool-loop");
	});

	// spec/packages/extensions/ai.md EC1: streaming lanes keep writing text.
	it("leaves streaming lanes on text deltas under the edit channel", () => {
		const route = routeAIRequest({
			prompt: "Continue this paragraph",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "text",
		});

		expect(route.lane).toBe("cursor-context");
		expect(route.allowToolUse).toBe(false);
	});
});
