import type { AICommandGuard } from "../types";

export const hasSelection: AICommandGuard = (ctx) =>
	ctx.selection !== null &&
	ctx.selection.type === "text" &&
	ctx.selectedText.length > 0;

export const isCollapsed: AICommandGuard = (ctx) =>
	ctx.selection !== null &&
	ctx.selection.type === "text" &&
	ctx.selectedText.length === 0;
