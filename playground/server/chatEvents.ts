import { streamAnthropic } from "./anthropicModel";
import { streamScripted } from "./scriptedModel";
import type { ChatEvent, ChatRequest } from "./protocol";

/**
 * Pick a model and stream `ChatEvent`s. Same choice the Node route and the
 * Cloudflare worker make: a request header or env key means Anthropic;
 * otherwise the scripted model answers.
 */
export async function* streamChatEvents(
	request: ChatRequest,
	apiKey: string | undefined,
	signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
	if (apiKey) {
		yield* streamAnthropic(request, apiKey, signal);
		return;
	}
	yield* streamScripted(request);
}
