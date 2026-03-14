import type { AICommandGuard } from "../types";

export const hasSelection: AICommandGuard = (ctx) =>
	ctx.selection !== null &&
	ctx.selection.type === "text" &&
	ctx.selectedText.length > 0;

export const isCollapsed: AICommandGuard = (ctx) =>
	ctx.selection !== null &&
	ctx.selection.type === "text" &&
	ctx.selectedText.length === 0;

export const blockTypeIs =
	(...types: string[]): AICommandGuard =>
	(ctx) =>
		ctx.blockType !== null && types.includes(ctx.blockType);

export const blockTypeIsNot =
	(...types: string[]): AICommandGuard =>
	(ctx) =>
		ctx.blockType !== null && !types.includes(ctx.blockType);

export const prefixMatches =
	(pattern: RegExp): AICommandGuard =>
	(ctx) => {
		if (!ctx.blockId) return false;
		const text = ctx.editor.getBlock(ctx.blockId)?.textContent() ?? "";
		return pattern.test(text);
	};

export const and =
	(...guards: AICommandGuard[]): AICommandGuard =>
	(ctx) =>
		guards.every((guard) => guard(ctx));

export const or =
	(...guards: AICommandGuard[]): AICommandGuard =>
	(ctx) =>
		guards.some((guard) => guard(ctx));
