import type { AITargetKind } from "../contracts";
import {
	resolveAllowedStructuredIntentKinds,
	stringifyContextSummary,
} from "./parse";
import {
	STRUCTURED_INTENT_REQUEST_PREFIX,
	type StructuredIntentPromptConfig,
	type StructuredIntentRequestEnvelope,
} from "./types";

export function getStructuredIntentOutputSchema(
	targetKind: AITargetKind,
): Record<string, unknown> {
	void targetKind;
	const positionSchema = {
		anyOf: [
			{ type: "string", enum: ["before_active", "after_active", "start", "end"] },
			{
				type: "object",
				properties: {
					beforeBlockId: { type: "string" },
				},
				required: ["beforeBlockId"],
			},
			{
				type: "object",
				properties: {
					afterBlockId: { type: "string" },
				},
				required: ["afterBlockId"],
			},
			{
				type: "object",
				properties: {
					parentId: { type: "string" },
					index: { type: "number" },
				},
				required: ["parentId", "index"],
			},
		],
	};
	const insertBlockSchema = {
		type: "object",
		properties: {
			kind: { const: "insert_block" },
			blockId: { type: "string" },
			blockType: {
				type: "string",
				enum: ["paragraph", "heading"],
			},
			position: positionSchema,
			props: {
				type: "object",
				additionalProperties: true,
			},
			initialText: { type: "string" },
			confidence: {
				anyOf: [
					{ type: "number" },
					{
						type: "object",
						properties: {
							score: { type: "number" },
							reason: { type: "string" },
						},
					},
				],
			},
		},
		required: ["kind", "blockType", "position"],
	};
	return {
		type: "object",
		anyOf: [
			insertBlockSchema,
			{
				type: "object",
				properties: {
					kind: { const: "review_bundle" },
					label: { type: "string" },
					reason: { type: "string" },
					changes: {
						type: "array",
						items: {
							anyOf: [insertBlockSchema],
						},
					},
				},
				required: ["kind", "label", "reason", "changes"],
			},
		],
	};
}

export function buildStructuredIntentRequestPrompt(
	config: StructuredIntentPromptConfig,
): string {
	const envelope: StructuredIntentRequestEnvelope = {
		version: 1,
		contract: "structured-intent",
		targetKind: config.targetKind,
		prompt: config.prompt,
		activeBlockId: config.activeBlockId,
		contextSummary: config.workingSet?.context ?? null,
	};
	return [
		STRUCTURED_INTENT_REQUEST_PREFIX,
		JSON.stringify(envelope),
	].join("\n");
}

export function parseStructuredIntentRequestPrompt(
	value: string,
): StructuredIntentRequestEnvelope | null {
	if (!value.startsWith(`${STRUCTURED_INTENT_REQUEST_PREFIX}\n`)) {
		return null;
	}
	const jsonPayload = value
		.slice(STRUCTURED_INTENT_REQUEST_PREFIX.length)
		.trimStart();
	try {
		const parsed = JSON.parse(jsonPayload) as StructuredIntentRequestEnvelope;
		if (
			parsed?.version === 1 &&
			parsed.contract === "structured-intent" &&
			typeof parsed.prompt === "string" &&
			typeof parsed.targetKind === "string"
		) {
			return parsed;
		}
		return null;
	} catch {
		// envelope json was unreadable.
		return null;
	}
}

export function buildStructuredIntentModelPrompt(
	request: StructuredIntentRequestEnvelope,
): string {
	const allowedKinds = resolveAllowedStructuredIntentKinds(request.targetKind);
	return [
		"Produce one structured Pen intent object.",
		"Return valid JSON only and no markdown fences or prose.",
		`Target kind: ${request.targetKind}`,
		`Allowed top-level intent kinds: ${allowedKinds.join(", ")}`,
		"",
		"Use these intent rules:",
		'- always include a top-level "kind" field',
		'- use "review_bundle" with a "changes" array for mixed edits',
		'- use "insert_block" for new blocks with position "after_active", "before_active", "start", or "end"',
		'- do not emit executor-level row/col operations',
		"",
		"Context summary:",
		stringifyContextSummary(request.contextSummary),
		"",
		"User request:",
		request.prompt,
	].join("\n");
}
