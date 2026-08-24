import type { InputRule, InputRuleContext, DocumentOp } from "@input/pen-types";

const CALLOUT_SEVERITY_MAP: Record<string, "info" | "warning" | "error"> = {
	note: "info",
	info: "info",
	warning: "warning",
	error: "error",
};

export const defaultBlockRules: InputRule[] = [
	headingRule(1, /^#\s$/),
	headingRule(2, /^##\s$/),
	headingRule(3, /^###\s$/),
	headingRule(4, /^####\s$/),
	headingRule(5, /^#####\s$/),
	headingRule(6, /^######\s$/),

	{
		id: "input-rule:unordered-list",
		match: /^[-*+]\s$/,
		blockTypes: ["paragraph"],
		handler: (_match, ctx) =>
			convertBlockOps(ctx, "bulletListItem", _match[0].length),
	},

	{
		id: "input-rule:ordered-list",
		match: /^(\d+)\.\s$/,
		blockTypes: ["paragraph"],
		handler: (match, ctx) => {
			const start = Number.parseInt(match[1]!, 10);
			return convertBlockOps(
				ctx,
				"numberedListItem",
				match[0].length,
				start > 1 ? { start } : {},
			);
		},
	},

	{
		id: "input-rule:check-list",
		match: /^\[[\sx]?\]\s$/i,
		blockTypes: ["paragraph"],
		handler: (match, ctx) => {
			const checked = match[0].toLowerCase().includes("x");
			return [
				{
					type: "splice-text",
					blockId: ctx.blockId,
					from: 0,
				to: 0 + match[0].length,
				insert: "",
				},
				{
					type: "set-props",
					blockId: ctx.blockId,
					props: { type: "checkListItem", checked },
				},
			];
		},
	},

	{
		id: "input-rule:blockquote",
		match: /^>\s$/,
		blockTypes: ["paragraph"],
		handler: (match, ctx) =>
			convertBlockOps(ctx, "blockquote", match[0].length),
	},

	{
		id: "input-rule:code-block",
		match: /^```[\s\n]$/,
		blockTypes: ["paragraph"],
		handler: (match, ctx) =>
			convertBlockOps(ctx, "codeBlock", match[0].length),
	},

	{
		id: "input-rule:divider",
		match: /^(?:---|\*\*\*|___)\s$/,
		blockTypes: ["paragraph"],
		handler: (match, ctx) => [
			{
				type: "splice-text",
				blockId: ctx.blockId,
				from: 0,
				to: 0 + match[0].length,
				insert: "",
			},
			{
				type: "set-props",
				blockId: ctx.blockId,
				props: { type: "divider" },
			},
		],
	},

	{
		id: "input-rule:callout",
		match: /^>\s*\[!(\w+)\]\s$/i,
		blockTypes: ["paragraph"],
		handler: (match, ctx) => {
			const raw = (match[1] ?? "info").toLowerCase();
			const severity = CALLOUT_SEVERITY_MAP[raw] ?? "info";
			return convertBlockOps(ctx, "callout", match[0].length, { severity });
		},
	},
];

function headingRule(level: number, match: RegExp): InputRule {
	return {
		id: `input-rule:heading-${level}`,
		match,
		blockTypes: ["paragraph"],
		handler: (m, ctx) =>
			convertBlockOps(ctx, "heading", m[0].length, { level }),
	};
}

function convertBlockOps(
	ctx: InputRuleContext,
	newType: string,
	deleteLength: number,
	newProps: Record<string, unknown> = {},
): DocumentOp[] {
	return [
		{
			type: "splice-text",
			blockId: ctx.blockId,
			from: 0,
				to: 0 + deleteLength,
				insert: "",
		},
		{
			type: "set-props",
			blockId: ctx.blockId,
			props: { type: newType, ...newProps },
		},
	];
}
