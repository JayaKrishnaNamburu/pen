import type { IncomingMessage, ServerResponse } from "node:http";
import { streamAnthropic } from "./anthropicModel";
import { streamScripted } from "./scriptedModel";
import type { ChatEvent, ChatRequest } from "./protocol";

/**
 * `POST /api/chat`: the one endpoint the playground has.
 *
 * With `ANTHROPIC_API_KEY` set it proxies Anthropic; without it, a scripted
 * model answers so a fresh clone still works. Either way the response is the
 * same newline-delimited event stream, which is why the browser does not know
 * or care which one replied.
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

	response.writeHead(200, {
		"content-type": "application/x-ndjson",
		"cache-control": "no-cache",
	});

	// Stopping a generation aborts the browser request; pass that on to the
	// provider so we are not billed for tokens nobody will read.
	const controller = new AbortController();
	incoming.on("close", () => controller.abort());

	const events = apiKey
		? streamAnthropic(request, apiKey, controller.signal)
		: streamScripted(request);

	try {
		for await (const event of events) {
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
