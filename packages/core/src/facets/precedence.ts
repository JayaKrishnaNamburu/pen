import type { Precedence } from "@input/pen-types";

export const HOOK_PRIORITIES = {
	AUTH: 100,
	SUGGEST: 200,
	INPUT_RULE: 300,
	DEFAULT: 500,
} as const;

export function priorityToPrecedence(priority: number): Precedence {
	if (priority <= 100) return "highest";
	if (priority <= 200) return "high";
	if (priority <= 300) return "default";
	if (priority <= 500) return "low";
	return "lowest";
}

export function hookPriorityToPrecedence(priority: number): Precedence {
	return priorityToPrecedence(priority);
}

export function keyBindingPriorityToPrecedence(priority: number): Precedence {
	return priorityToPrecedence(priority);
}
