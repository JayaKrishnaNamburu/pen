import type { IncomingMessage, ServerResponse } from "node:http";

export function readHeader(req: IncomingMessage, key: string): string | null {
	const value = req.headers[key];
	if (Array.isArray(value)) {
		return value[0] ?? null;
	}

	return value ?? null;
}

export async function readJsonBody<T = unknown>(
	req: IncomingMessage,
): Promise<T | undefined> {
	const chunks: Uint8Array[] = [];

	for await (const chunk of req) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}

	if (chunks.length === 0) {
		return undefined;
	}

	const body = Buffer.concat(chunks).toString("utf8").trim();
	return body ? (JSON.parse(body) as T) : undefined;
}

export function sendJson(
	res: ServerResponse,
	statusCode: number,
	body: Record<string, unknown>,
): void {
	res.writeHead(statusCode, {
		"content-type": "application/json; charset=utf-8",
	});
	res.end(JSON.stringify(body));
}

export function writeJsonLine(
	res: ServerResponse,
	payload: Record<string, unknown>,
): void {
	res.write(`${JSON.stringify(payload)}\n`);
}

export function formatError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return typeof error === "string" ? error : "Unknown error";
}
