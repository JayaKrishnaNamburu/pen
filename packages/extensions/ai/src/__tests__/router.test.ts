import { describe, expect, it } from "vitest";
import { refineRouteWithNavigator, routeAIRequest } from "../runtime/router";

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
		expect(route.plannerMode).toBe("text");
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
			surroundingBlockCount: 1,
			selectedTextLength: 0,
		});

		expect(initialRoute.lane).toBe("cursor-context");
		expect(refinedRoute.lane).toBe("tool-loop");
		expect(refinedRoute.plannerMode).toBe("text");
		expect(refinedRoute.applyStrategy).toBe("markdown-fast-apply");
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
		expect(route.applyStrategy).toBe("markdown-fast-apply");
		expect(route.shouldStreamDirectly).toBe(false);
	});

	it("routes bottom-chat block writing into streaming suggestions", () => {
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

		expect(route.lane).toBe("context-first");
		expect(route.mutationMode).toBe("streaming-suggestions");
		expect(route.applyStrategy).toBe("markdown-full-replace");
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
		expect(route.plannerMode).toBe("text");
		expect(route.applyStrategy).toBe("markdown-fast-apply");
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
		expect(route.plannerMode).toBe("text");
		expect(route.mutationMode).toBe("streaming-suggestions");
		expect(route.applyStrategy).toBe("markdown-full-replace");
		expect(route.contentFormat).toBe("markdown");
		expect(route.blockClass).toBe("flow");
		expect(route.adapterId).toBe("flow-markdown");
		expect(route.transportKind).toBe("flow-text");
		expect(route.shouldStreamDirectly).toBe(false);
	});
});
