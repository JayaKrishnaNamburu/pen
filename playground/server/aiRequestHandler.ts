import { jsonSchema, Output, stepCountIs, streamText } from "ai";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
	buildStructuredIntentModelPrompt,
	createPlaygroundRequestMetricsSeed,
	getStructuredIntentOutputSchema,
	parseStructuredIntentRequestPrompt,
} from "@pen/ai";
import { AI_SUGGESTIONS_REQUEST_MODE } from "@pen/ai-suggestions";
import {
	PLAYGROUND_MAX_TOOL_STEPS,
	createPlaygroundLanguageModel,
	logPlaygroundEvent,
	roundMs,
} from "./config";
import { formatError, readJsonBody, sendJson, writeJsonLine } from "./http";
import { handleAISuggestionsRequest } from "./aiSuggestionsRequest";
import { streamLocalOperationResponse } from "./localOperationStream";
import { remapRequestedOperationBlockIds } from "./operationValidation";
import { buildPlaygroundTools } from "./toolHandlers";
import { PlaygroundSessionStore } from "./sessionStore";
import { recordPlaygroundRequestMetadata } from "./sessionHandlers";
import {
	buildPlaygroundRequestPlan,
	parseAISuggestionRequestScope,
	parsePlaygroundRequestMode,
	resolveOperationRequestMode,
} from "./requestPlan";
import { createLocalOperationPayloadCollector } from "./utils/localOperationPayload";
import type { AIRequestBody, PlaygroundRequestMetrics } from "./types";
import { parseRequestedOperation } from "./operationValidation";

export function createAIRequestHandler(sessionStore: PlaygroundSessionStore) {
	return async function handleAIRequest(
		req: IncomingMessage,
		res: ServerResponse,
	): Promise<void> {
		if (!process.env.ANTHROPIC_API_KEY) {
			logPlaygroundEvent("ai:request-rejected", {
				reason: "missing-api-key",
			});
			sendJson(res, 500, {
				error: "Missing ANTHROPIC_API_KEY. Add it to playground/.env.local before starting the backend.",
			});
			return;
		}

		const body = (await readJsonBody<AIRequestBody>(req)) ?? {};
		const prompt =
			typeof body.prompt === "string" ? body.prompt.trim() : "";
		const sessionId =
			typeof body.sessionId === "string" ? body.sessionId : null;
		const isAISuggestionsRequest =
			body.requestMode === AI_SUGGESTIONS_REQUEST_MODE;
		const suggestionScope = parseAISuggestionRequestScope(
			body.suggestionScope,
		);
		const requestedMode = parsePlaygroundRequestMode(body.requestMode);
		const requestedOperation = parseRequestedOperation(body.operation);
		const expectedSyncRevision =
			typeof body.expectedSyncRevision === "number" &&
			Number.isInteger(body.expectedSyncRevision) &&
			body.expectedSyncRevision >= 0
				? body.expectedSyncRevision
				: null;
		const expectedSyncedGeneration =
			typeof body.expectedSyncedGeneration === "number" &&
			Number.isInteger(body.expectedSyncedGeneration) &&
			body.expectedSyncedGeneration >= 0
				? body.expectedSyncedGeneration
				: null;

		if (!isAISuggestionsRequest && !prompt) {
			logPlaygroundEvent("ai:request-rejected", {
				reason: "empty-prompt",
			});
			sendJson(res, 400, { error: "Expected a non-empty prompt." });
			return;
		}

		if (isAISuggestionsRequest && !suggestionScope) {
			sendJson(res, 400, {
				error: "Expected a valid AI suggestions scope payload.",
			});
			return;
		}

		if (!sessionId) {
			logPlaygroundEvent("ai:request-rejected", {
				reason: "missing-session-id",
			});
			sendJson(res, 400, {
				error: "Expected a valid playground session ID.",
			});
			return;
		}

		const session = sessionStore.get(sessionId);
		if (!session) {
			logPlaygroundEvent("ai:request-rejected", {
				sessionId,
				reason: "session-not-found",
			});
			sendJson(res, 404, { error: "Playground session not found." });
			return;
		}

		if (session.activeRequestCount > 0) {
			logPlaygroundEvent("ai:request-rejected", {
				sessionId,
				reason: "active-request",
				activeRequestCount: session.activeRequestCount,
			});
			sendJson(res, 409, {
				error: "This playground session already has an active AI request.",
			});
			return;
		}
		if (
			expectedSyncRevision != null &&
			session.syncedRevision != null &&
			expectedSyncRevision !== session.syncedRevision
		) {
			sendJson(res, 409, {
				error: "The playground AI session is out of sync with the editor state.",
			});
			return;
		}
		if (
			expectedSyncedGeneration != null &&
			session.syncedGeneration != null &&
			expectedSyncedGeneration !== session.syncedGeneration
		) {
			sendJson(res, 409, {
				error: "The playground AI session is out of sync with the editor document.",
			});
			return;
		}

		session.activeRequestCount += 1;
		sessionStore.touch(session);
		const abortController = new AbortController();
		const requestId = randomUUID();
		const resolvedOperation =
			requestedOperation != null
				? remapRequestedOperationBlockIds(
						requestedOperation,
						session.clientToServerBlockIds,
					)
				: null;
		const requestPlan = buildPlaygroundRequestPlan(
			session.editor,
			prompt,
			resolveOperationRequestMode(resolvedOperation, requestedMode),
			resolvedOperation,
		);
		const structuredIntentRequest = resolvedOperation
			? null
			: parseStructuredIntentRequestPrompt(prompt);
		const metrics: PlaygroundRequestMetrics = {
			requestId,
			sessionId,
			startedAt: performance.now(),
			...createPlaygroundRequestMetricsSeed(requestPlan),
		};
		recordPlaygroundRequestMetadata(session, requestId, requestPlan.mode);
		const abortActiveRequest = () => {
			if (abortController.signal.aborted || res.writableEnded) {
				return;
			}
			abortController.abort();
			logPlaygroundEvent("ai:request-abort-signal", {
				requestId,
				sessionId,
			});
		};

		req.on("aborted", abortActiveRequest);
		req.on("close", abortActiveRequest);
		res.on("close", abortActiveRequest);

		try {
			if (isAISuggestionsRequest && suggestionScope) {
				await handleAISuggestionsRequest(
					res,
					suggestionScope,
					abortController.signal,
				);
				return;
			}

			logPlaygroundEvent("ai:request-start", {
				requestId,
				sessionId,
				mode: requestPlan.mode,
				model: requestPlan.modelId,
				contextFormatResolved: requestPlan.contextFormat,
				promptLength: prompt.length,
				maxOutputTokens: requestPlan.maxOutputTokens ?? null,
				temperature: requestPlan.temperature ?? null,
				stopSequenceCount: requestPlan.stopSequences?.length ?? 0,
				selectedTextLength: requestPlan.selectedTextLength,
				contextBytesJson: metrics.contextBytesJson,
				contextEstimatedTokensJson: metrics.contextEstimatedTokensJson,
			});

			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache, no-transform",
				connection: "keep-alive",
			});

			writeJsonLine(res, {
				type: "meta",
				requestId,
				sessionId,
				requestMode: requestPlan.mode,
				requestModel: requestPlan.modelId,
				contextFormat: requestPlan.contextFormat,
			});
			writeJsonLine(res, { type: "phase", phase: "thinking" });

			const isLocalOperation =
				resolvedOperation != null &&
				(resolvedOperation.kind === "rewrite-selection" ||
					resolvedOperation.kind === "rewrite-block" ||
					resolvedOperation.kind === "continue-block" ||
					(resolvedOperation.kind === "document-transform" &&
						resolvedOperation.target.kind === "document" &&
						(resolvedOperation.target.transform === "rewrite" ||
							resolvedOperation.target.transform === "remove" ||
							resolvedOperation.target.placement ===
								"replace-blocks")));

			if (isLocalOperation) {
				await streamLocalOperationResponse({
					res,
					editor: session.editor,
					prompt,
					operation: resolvedOperation,
					requestedMode:
						body.requestMode === "bottom-chat" ||
						body.requestMode === "inline-edit" ||
						body.requestMode === "structured-planner"
							? body.requestMode
							: requestedMode,
					requestPlan,
					abortSignal: abortController.signal,
					metrics,
					requestId,
					sessionId,
				});
			} else if (structuredIntentRequest) {
				const structuredChunkTypePrefix =
					structuredIntentRequest.targetKind === "table"
						? "grid"
						: "app";
				const result = streamText({
					model: createPlaygroundLanguageModel(requestPlan.modelId),
					system: requestPlan.systemPrompt,
					prompt: buildStructuredIntentModelPrompt(
						structuredIntentRequest,
					),
					output: Output.object({
						schema: jsonSchema(
							getStructuredIntentOutputSchema(
								structuredIntentRequest.targetKind,
							),
						),
					}),
					...(requestPlan.maxOutputTokens != null
						? { maxOutputTokens: requestPlan.maxOutputTokens }
						: {}),
					...(requestPlan.temperature != null
						? { temperature: requestPlan.temperature }
						: {}),
					abortSignal: abortController.signal,
				});
				for await (const partial of result.partialOutputStream) {
					if (metrics.firstTextDeltaServerMs == null) {
						metrics.firstTextDeltaServerMs =
							performance.now() - metrics.startedAt;
						logPlaygroundEvent("ai:first-structured-partial", {
							requestId,
							sessionId,
							elapsedMs: roundMs(metrics.firstTextDeltaServerMs),
						});
					}
					writeJsonLine(res, { type: "phase", phase: "writing" });
					writeJsonLine(res, {
						type: `${structuredChunkTypePrefix}-partial`,
						data: partial,
					});
				}
				writeJsonLine(res, {
					type: `${structuredChunkTypePrefix}-final`,
					data: await result.output,
				});
			} else {
				const result = streamText({
					model: createPlaygroundLanguageModel(requestPlan.modelId),
					system: requestPlan.systemPrompt,
					prompt: requestPlan.prompt,
					...(requestPlan.useTools
						? {
								tools: buildPlaygroundTools(
									session.editor,
									metrics,
								),
								stopWhen: stepCountIs(
									PLAYGROUND_MAX_TOOL_STEPS,
								),
							}
						: {}),
					...(requestPlan.maxOutputTokens != null
						? { maxOutputTokens: requestPlan.maxOutputTokens }
						: {}),
					...(requestPlan.temperature != null
						? { temperature: requestPlan.temperature }
						: {}),
					...(requestPlan.stopSequences
						? { stopSequences: requestPlan.stopSequences }
						: {}),
					abortSignal: abortController.signal,
				});

				const shouldStreamRawText =
					requestPlan.mode === "inline-autocomplete";
				const documentPayloadCollector = shouldStreamRawText
					? null
					: createLocalOperationPayloadCollector();
				let lastSentLength = 0;
				for await (const part of result.fullStream) {
					if (part.type === "tool-call") {
						if (metrics.firstToolStartMs == null) {
							metrics.firstToolStartMs =
								performance.now() - metrics.startedAt;
							logPlaygroundEvent("ai:first-tool-call", {
								requestId,
								sessionId,
								toolName: part.toolName,
								elapsedMs: roundMs(metrics.firstToolStartMs),
							});
						}
						metrics.toolCallCount += 1;
						writeJsonLine(res, {
							type: "phase",
							phase: "tool-calling",
						});
						continue;
					}

					if (part.type === "text-delta") {
						if (metrics.firstTextDeltaServerMs == null) {
							metrics.firstTextDeltaServerMs =
								performance.now() - metrics.startedAt;
							logPlaygroundEvent("ai:first-text-delta", {
								requestId,
								sessionId,
								elapsedMs: roundMs(
									metrics.firstTextDeltaServerMs,
								),
							});
						}
						if (shouldStreamRawText) {
							writeJsonLine(res, {
								type: "phase",
								phase: "writing",
							});
							writeJsonLine(res, {
								type: "text-delta",
								delta: part.text,
							});
							continue;
						}
						const preview = documentPayloadCollector?.push(
							part.text,
						);
						if (
							preview?.changed &&
							preview.text.length > lastSentLength
						) {
							const increment =
								preview.text.slice(lastSentLength);
							lastSentLength = preview.text.length;
							writeJsonLine(res, {
								type: "phase",
								phase: "writing",
							});
							writeJsonLine(res, {
								type: "text-delta",
								delta: increment,
							});
						}
						continue;
					}

					if (part.type === "error") {
						throw part.error;
					}
				}

				if (!shouldStreamRawText) {
					const documentPayload =
						documentPayloadCollector?.finalize();
					if (documentPayload && !documentPayload.ok) {
						logPlaygroundEvent("ai:document-payload-invalid", {
							requestId,
							sessionId,
							reason: documentPayload.reason,
						});
					}
				}
			}

			metrics.totalServerMs = performance.now() - metrics.startedAt;
			logPlaygroundEvent("ai:request-complete", {
				requestId,
				sessionId,
				mode: requestPlan.mode,
				model: requestPlan.modelId,
				totalServerMs: roundMs(metrics.totalServerMs),
				toolCallCount: metrics.toolCallCount,
				toolExecutionMs: roundMs(metrics.toolExecutionMs),
				firstToolStartMs: roundMs(metrics.firstToolStartMs),
				firstToolResultMs: roundMs(metrics.firstToolResultMs),
				firstTextDeltaServerMs: roundMs(metrics.firstTextDeltaServerMs),
			});
			writeJsonLine(res, {
				type: "metrics",
				requestId,
				sessionId,
				requestMode: metrics.requestMode,
				requestModel: metrics.requestModel,
				contextFormat: metrics.contextFormat,
				firstToolStartMs: metrics.firstToolStartMs,
				firstToolResultMs: metrics.firstToolResultMs,
				firstTextDeltaServerMs: metrics.firstTextDeltaServerMs,
				totalServerMs: metrics.totalServerMs,
				toolCallCount: metrics.toolCallCount,
				toolExecutionMs: metrics.toolExecutionMs,
				contextBytesJson: metrics.contextBytesJson,
				contextEstimatedTokensJson: metrics.contextEstimatedTokensJson,
			});
			writeJsonLine(res, { type: "done" });
			res.end();
		} catch (error) {
			logPlaygroundEvent("ai:request-error", {
				requestId,
				sessionId,
				error: formatError(error),
			});
			if (!res.headersSent) {
				sendJson(res, 500, { error: formatError(error) });
				return;
			}

			writeJsonLine(res, {
				type: "error",
				error: formatError(error),
			});
			res.end();
		} finally {
			session.activeRequestCount = Math.max(
				0,
				session.activeRequestCount - 1,
			);
			sessionStore.touch(session);
			logPlaygroundEvent("ai:request-finish", {
				requestId,
				sessionId,
				activeRequestCount: session.activeRequestCount,
			});
		}
	};
}
