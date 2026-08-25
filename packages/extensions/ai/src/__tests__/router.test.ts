import { describe, expect, it } from "vitest";
import {
	AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS,
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

		// Structural creation on a small flow document streams markdown in a
		// single pass instead of going through the tool loop.
		expect(route.lane).toBe("context-first");
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

	// spec-better-ai/01-edit-channel.md EC12
	it("sends the edit channel's durable edits through the tool loop", () => {
		const input = {
			prompt: "Create a table with names",
			selection: null,
			blockType: "paragraph",
			blockCount: 1,
			suggestMode: false,
			target: "block" as const,
			contentFormat: "markdown" as const,
			surface: "bottom-chat" as const,
		};

		expect(routeAIRequest(input).lane).toBe("context-first");

		const toolRoute = routeAIRequest({ ...input, editChannel: "tool" });
		expect(toolRoute.lane).toBe("tool-loop");
		expect(toolRoute.allowToolUse).toBe(true);
		// The durable edit has exactly one source: nothing is parsed out of
		// the text stream on this channel.
		expect(toolRoute.applyStrategy).toBe("tool-edit");
	});

	it("keeps the fast-apply lane within the bound the working set annotates", () => {
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
				blockCount: AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS,
			}).lane,
		).toBe("context-first");

		// Past the bound the working set stops annotating block ids, and the
		// fast-apply prompt has nothing to address its edits to, so this
		// document belongs to the tool loop instead.
		expect(
			routeAIRequest({
				...input,
				blockCount: AI_FAST_APPLY_MAX_DOCUMENT_BLOCKS + 1,
			}).lane,
		).toBe("tool-loop");
	});

	it("EC12: default channel does not select tool-edit for document-edit prompts", () => {
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
		expect(table.applyStrategy).not.toBe("tool-edit");

		const improve = routeAIRequest({
			prompt: "Improve the text and make the last bit a bullet.",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
		});
		expect(improve.applyStrategy).not.toBe("tool-edit");
	});

	it("EC12: editChannel tool selects tool-edit on the tool-loop lane", () => {
		const route = routeAIRequest({
			prompt: "Create a table with names",
			selection: null,
			blockType: "paragraph",
			blockCount: 1,
			suggestMode: false,
			target: "block",
			contentFormat: "markdown",
			surface: "bottom-chat",
			editChannel: "tool",
		});
		expect(route.applyStrategy).toBe("tool-edit");
		expect(route.lane).toBe("tool-loop");
	});

	// spec-better-ai/01-edit-channel.md EC1: streaming lanes keep writing text.
	it("leaves streaming lanes on text deltas under the edit channel", () => {
		const route = routeAIRequest({
			prompt: "Continue this paragraph",
			selection: null,
			blockType: "paragraph",
			blockCount: 20,
			suggestMode: false,
			target: "block",
			contentFormat: "text",
			editChannel: "tool",
		});

		expect(route.lane).toBe("cursor-context");
		expect(route.allowToolUse).toBe(false);
	});
});
