import {
	AI_EGRESS_INVENTORY_CODE,
	AI_REQUEST_REFUSED_CODE,
	type AIRequestContext,
	type AIRequestFilter,
	type Editor,
	type Extension,
	type ModelAdapter,
	type ModelRequestedOperation,
	type ModelStreamEvent,
} from "@input/pen-types";

import { defineExtension } from "../schema/defineExtension";
import { defineFacet } from "./defineFacet";

export const aiEgressFacet = defineFacet<
	AIRequestFilter,
	AIRequestFilter | undefined
>({
	name: "pen.aiEgress",
	combine: (inputs) => {
		if (inputs.length === 0) {
			return undefined;
		}
		return (context) => {
			let current = context;
			for (const filter of inputs) {
				const next = filter(current);
				if (next === null) {
					return null;
				}
				current = next;
			}
			return current;
		};
	},
});

export function aiEgressExtension(filter: AIRequestFilter): Extension {
	return defineExtension({
		name: "pen-ai-egress",
		facets: [aiEgressFacet.of(filter)],
	});
}

export function filterAIRequest(
	editor: Editor,
	context: AIRequestContext,
): AIRequestContext | null {
	const filter = editor.facet(aiEgressFacet);
	const next = filter ? filter(context) : context;
	if (next === null) {
		emitRefused(editor, context);
		return null;
	}
	emitInventory(editor, next);
	return next;
}

export async function* streamThroughEgress(
	editor: Editor,
	model: ModelAdapter,
	context: AIRequestContext,
	extras: {
		signal?: AbortSignal;
		requestMode?: string;
		operation?: ModelRequestedOperation | null;
		sessionId?: string;
		turnId?: string;
		generationId?: string;
	} = {},
): AsyncIterable<ModelStreamEvent> {
	const filtered = filterAIRequest(editor, context);
	if (filtered == null) {
		return;
	}
	yield* model.stream({
		messages: filtered.messages,
		tools: filtered.tools,
		signal: extras.signal,
		requestMode: extras.requestMode,
		operation: extras.operation ?? undefined,
		sessionId: extras.sessionId,
		turnId: extras.turnId,
		generationId: extras.generationId,
		...({ context: filtered } as object),
	} as Parameters<ModelAdapter["stream"]>[0]);
}

function emitInventory(editor: Editor, context: AIRequestContext): void {
	if (!editor.internals.hasListeners("diagnostic")) {
		return;
	}
	editor.internals.emit("diagnostic", {
		code: AI_EGRESS_INVENTORY_CODE,
		level: "info",
		source: "ai",
		message: "AI request excerpt inventory",
		feature: context.feature,
		excerpts: context.documentExcerpts.map((excerpt) => ({
			blockId: excerpt.blockId,
			kind: excerpt.kind,
		})),
	});
}

function emitRefused(editor: Editor, context: AIRequestContext): void {
	editor.internals.emit("diagnostic", {
		code: AI_REQUEST_REFUSED_CODE,
		level: "info",
		source: "ai",
		message: "AI request refused by pen.aiEgress",
		feature: context.feature,
	});
}
