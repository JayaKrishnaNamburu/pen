import type { AICommandBinding } from "../types";
import { hasSelection, isCollapsed } from "./guards";

export const defaultAICommands: AICommandBinding[] = [
	{
		id: "ai:rewrite",
		label: "Rewrite",
		description: "Rewrite the selected text",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Rewrite the following text while preserving its meaning:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:continue",
		label: "Continue writing",
		description: "Continue writing from the current position",
		group: "generate",
		target: "block",
		prompt: (ctx) => {
			const block = ctx.blockId ? ctx.editor.getBlock(ctx.blockId) : null;
			const text = block?.textContent({ resolved: true }) ?? "";
			return `Continue writing from where this text leaves off:\n\n${text}`;
		},
		guard: isCollapsed,
	},
	{
		id: "ai:summarize",
		label: "Summarize",
		description: "Summarize the selected text",
		group: "edit",
		target: "selection",
		prompt: (ctx) => `Summarize the following text concisely:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:fix-grammar",
		label: "Fix grammar",
		description: "Fix grammar and spelling",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Fix grammar and spelling in the following text while preserving meaning and tone:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:simplify",
		label: "Simplify",
		description: "Make the text simpler and more concise",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Simplify the following text. Make it clearer and more concise:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:expand",
		label: "Expand",
		description: "Expand the text with more detail",
		group: "generate",
		target: "selection",
		prompt: (ctx) =>
			`Expand the following text with more detail and examples:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:translate",
		label: "Translate",
		description: "Translate to another language",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Translate the following text to the language specified by the user:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
];
