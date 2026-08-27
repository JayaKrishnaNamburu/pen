export const DEFAULT_SEARCH_MAX_RESULTS = 20;
export const DEFAULT_RETRIEVE_SPANS_MAX_RESULTS = 5;
export const MAX_TOOL_RESULT_LIMIT = 50;

export const POSITION_SCHEMA = {
	anyOf: [
		{
			type: "string",
			enum: ["first", "last"],
		},
		{
			type: "object",
			required: ["before"],
			properties: {
				before: {
					type: "string",
					minLength: 1,
				},
			},
		},
		{
			type: "object",
			required: ["after"],
			properties: {
				after: {
					type: "string",
					minLength: 1,
				},
			},
		},
		{
			type: "object",
			required: ["parent", "index"],
			properties: {
				parent: {
					type: "string",
					minLength: 1,
				},
				index: {
					type: "number",
					minimum: 0,
				},
			},
		},
	],
} as const;

export function normalizeToolResultLimit(
	value: unknown,
	defaultValue: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return defaultValue;
	}

	return Math.min(MAX_TOOL_RESULT_LIMIT, Math.max(1, Math.floor(value)));
}
