import type { IncomingMessage, ServerResponse } from "node:http";
import { streamChatEvents } from "./chatEvents";
import type { ChatEvent, ChatRequest } from "./protocol";

/**
 * `POST /api/chat`: the one endpoint the playground has.
 *
 * A request header `x-anthropic-api-key` (from the agent menu) or
 * `ANTHROPIC_API_KEY` on the server proxies Anthropic; without either, a
 * scripted model answers so a fresh clone still works. Either way the
 * response is the same newline-delimited event stream.
 */
export async function handleChatRequest(
	incoming: IncomingMessage,
	response: ServerResponse,
	apiKey: string | undefined,
): Promise<void> {
	let request: ChatRequest;
	try {
		request = JSON.parse(await readBody(incoming)) as ChatRequest;
	} catch {
		response.statusCode = 400;
		response.end("Expected a JSON body");
		return;
	}

	incoming.socket?.setNoDelay(true);
	response.writeHead(200, {
		"content-type": "application/x-ndjson",
		"cache-control": "no-cache",
		"x-accel-buffering": "no",
	});

	// Stopping a generation aborts the browser request; pass that on to the
	// provider so we are not billed for tokens nobody will read.
	const controller = new AbortController();
	incoming.on("close", () => controller.abort());

	const resolvedKey = resolveApiKey(incoming, apiKey);

	try {
		for await (const event of streamChatEvents(
			request,
			resolvedKey,
			controller.signal,
		)) {
			if (controller.signal.aborted) {
				break;
			}
			write(response, event);
		}
	} catch (error) {
		if (!controller.signal.aborted) {
			write(response, { type: "error", error: describe(error) });
		}
	}

	response.end();
}

function resolveApiKey(
	incoming: IncomingMessage,
	envKey: string | undefined,
): string | undefined {
	const header = incoming.headers["x-anthropic-api-key"];
	const fromHeader = typeof header === "string" ? header.trim() : "";
	if (fromHeader.length > 0) {
		return fromHeader;
	}
	return envKey;
}

function write(response: ServerResponse, event: ChatEvent): void {
	response.write(`${JSON.stringify(event)}\n`);
}

function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function readBody(incoming: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = "";
		incoming.on("data", (chunk) => {
			body += chunk;
		});
		incoming.on("end", () => resolve(body));
		incoming.on("error", reject);
	});
}
