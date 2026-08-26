import type { AICommandBinding } from "../types";
import { hasSelection, isCollapsed } from "./guards";

export const defaultAICommands: AICommandBinding[] = [
	{
		id: "ai:rewrite",
		label: "pen.ai.command.rewrite",
		description: "pen.ai.command.rewrite.description",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Rewrite the following text while preserving its meaning:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:continue",
		label: "pen.ai.command.continue",
		description: "pen.ai.command.continue.description",
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
		label: "pen.ai.command.summarize",
		description: "pen.ai.command.summarize.description",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Summarize the following text concisely:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:fix-grammar",
		label: "pen.ai.command.fixGrammar",
		description: "pen.ai.command.fixGrammar.description",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Fix grammar and spelling in the following text while preserving meaning and tone:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:simplify",
		label: "pen.ai.command.simplify",
		description: "pen.ai.command.simplify.description",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Simplify the following text. Make it clearer and more concise:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:expand",
		label: "pen.ai.command.expand",
		description: "pen.ai.command.expand.description",
		group: "generate",
		target: "selection",
		prompt: (ctx) =>
			`Expand the following text with more detail and examples:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
	{
		id: "ai:translate",
		label: "pen.ai.command.translate",
		description: "pen.ai.command.translate.description",
		group: "edit",
		target: "selection",
		prompt: (ctx) =>
			`Translate the following text to the language specified by the user:\n\n${ctx.selectedText}`,
		guard: hasSelection,
	},
];
