import { buildExplicitLocalOperationPrompt } from "@pen/ai";
import { streamText } from "ai";
import type { ServerResponse } from "node:http";
import type { Editor, ModelRequestedOperation } from "@pen/types";
import {
	LOCAL_OPERATION_PAYLOAD_END,
	LOCAL_OPERATION_PAYLOAD_START,
	createLocalOperationPayloadCollector,
} from "./utils/localOperationPayload";
import {
	PLAYGROUND_LOCAL_CONTINUE_SYSTEM_PROMPT,
	PLAYGROUND_LOCAL_REWRITE_SYSTEM_PROMPT,
	createPlaygroundLanguageModel,
	logPlaygroundEvent,
	roundMs,
} from "./config";
import { writeJsonLine } from "./http";
import {
	resolveLocalOperationFrameType,
	resolveRequestedOperationConflict,
} from "./operationValidation";
import type {
	PlaygroundRequestMetrics,
	PlaygroundRequestPlan,
	PlaygroundRequestedMode,
} from "./types";

export async function streamLocalOperationResponse(input: {
	res: ServerResponse;
	editor: Editor;
	prompt: string;
	operation: ModelRequestedOperation;
	requestedMode: PlaygroundRequestedMode | null;
	requestPlan: PlaygroundRequestPlan;
	abortSignal: AbortSignal;
	metrics: PlaygroundRequestMetrics;
	requestId: string;
	sessionId: string;
}): Promise<void> {
	const {
		res,
		editor,
		prompt,
		operation,
		requestedMode,
		requestPlan,
		abortSignal,
		metrics,
		requestId,
		sessionId,
	} = input;
	const usesClientInlineSelectionPreview = requestedMode === "inline-edit";
	const conflictReason = resolveRequestedOperationConflict(
		editor,
		operation,
		{
			allowSelectionTextMismatch: usesClientInlineSelectionPreview,
		},
	);
	if (conflictReason) {
		writeJsonLine(res, {
			type: "conflict",
			reason: conflictReason,
			operation,
		});
		return;
	}

	const result = streamText({
		model: createPlaygroundLanguageModel(requestPlan.modelId),
		system:
			operation.kind === "continue-block"
				? PLAYGROUND_LOCAL_CONTINUE_SYSTEM_PROMPT
				: PLAYGROUND_LOCAL_REWRITE_SYSTEM_PROMPT,
		prompt: usesClientInlineSelectionPreview
			? buildExplicitLocalOperationPrompt(prompt, operation)
			: requestPlan.prompt,
		...(requestPlan.maxOutputTokens != null
			? { maxOutputTokens: requestPlan.maxOutputTokens }
			: {}),
		...(requestPlan.temperature != null
			? { temperature: requestPlan.temperature }
			: {}),
		...(requestPlan.stopSequences
			? { stopSequences: requestPlan.stopSequences }
			: {}),
		abortSignal,
	});

	const payloadCollector = createLocalOperationPayloadCollector();
	for await (const part of result.fullStream) {
		if (part.type === "text-delta") {
			if (metrics.firstTextDeltaServerMs == null) {
				metrics.firstTextDeltaServerMs =
					performance.now() - metrics.startedAt;
				logPlaygroundEvent("ai:first-text-delta", {
					requestId,
					sessionId,
					elapsedMs: roundMs(metrics.firstTextDeltaServerMs),
				});
			}
			const preview = payloadCollector.push(part.text);
			if (preview.changed && preview.text.length > 0) {
				writeJsonLine(res, { type: "phase", phase: "writing" });
				writeJsonLine(res, {
					type: resolveLocalOperationFrameType(operation, "preview"),
					text: preview.text,
					operation,
				});
			}
			continue;
		}
		if (part.type === "error") {
			throw part.error;
		}
	}

	const payload = payloadCollector.finalize();
	if (!payload.ok) {
		throw new Error(payload.reason);
	}

	writeJsonLine(res, {
		type: resolveLocalOperationFrameType(operation, "final"),
		text: payload.text,
		operation,
	});
}
