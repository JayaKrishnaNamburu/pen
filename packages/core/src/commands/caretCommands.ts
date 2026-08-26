import { defineCommand } from "./define";
import type { CaretMotionParam, SelectBlockParam } from "./caretParams";

export const caretLeft = defineCommand<CaretMotionParam>("pen.caretLeft");
export const caretRight = defineCommand<CaretMotionParam>("pen.caretRight");
export const caretUp = defineCommand<CaretMotionParam>("pen.caretUp");
export const caretDown = defineCommand<CaretMotionParam>("pen.caretDown");
export const caretLineStart =
	defineCommand<CaretMotionParam>("pen.caretLineStart");
export const caretLineEnd = defineCommand<CaretMotionParam>("pen.caretLineEnd");
export const caretBlockStart = defineCommand<CaretMotionParam>(
	"pen.caretBlockStart",
);
export const caretBlockEnd =
	defineCommand<CaretMotionParam>("pen.caretBlockEnd");
export const caretDocStart =
	defineCommand<CaretMotionParam>("pen.caretDocStart");
export const caretDocEnd = defineCommand<CaretMotionParam>("pen.caretDocEnd");
export const caretWordLeft =
	defineCommand<CaretMotionParam>("pen.caretWordLeft");
export const caretWordRight =
	defineCommand<CaretMotionParam>("pen.caretWordRight");
export const selectAll = defineCommand("pen.selectAll");
export const selectBlock = defineCommand<SelectBlockParam>("pen.selectBlock");
