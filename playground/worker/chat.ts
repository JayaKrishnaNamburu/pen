import { streamChatEvents } from "../server/chatEvents";
import type { ChatRequest } from "../server/protocol";

/**
 * `POST /api/chat` for the Cloudflare worker. Same body and ndjson stream
 * as the Vite middleware; Fetch instead of Node's IncomingMessage.
 */
export async function handleChatFetch(
	request: Request,
	envKey: string | undefined,
): Promise<Response> {
	let body: ChatRequest;
	try {
		body = (await request.json()) as ChatRequest;
	} catch {
		return new Response("Expected a JSON body", { status: 400 });
	}

	const header = request.headers.get("x-anthropic-api-key")?.trim() ?? "";
	const apiKey = header.length > 0 ? header : envKey;
	const { readable, writable } = new TransformStream<
		Uint8Array,
		Uint8Array
	>();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();

	void writeChat(body, apiKey, request.signal, writer, encoder);

	return new Response(readable, {
		headers: {
			"content-type": "application/x-ndjson",
			"cache-control": "no-cache",
		},
	});
}

async function writeChat(
	body: ChatRequest,
	apiKey: string | undefined,
	signal: AbortSignal,
	writer: WritableStreamDefaultWriter<Uint8Array>,
	encoder: TextEncoder,
): Promise<void> {
	try {
		for await (const event of streamChatEvents(body, apiKey, signal)) {
			await writer.write(encoder.encode(`${JSON.stringify(event)}\n`));
		}
	} catch (error) {
		if (!signal.aborted) {
			const message =
				error instanceof Error ? error.message : String(error);
			await writer.write(
				encoder.encode(
					`${JSON.stringify({ type: "error", error: message })}\n`,
				),
			);
		}
	} finally {
		await writer.close();
	}
}
