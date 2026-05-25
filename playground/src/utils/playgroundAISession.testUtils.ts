import { createEditor } from "@pen/core";
import { createDefaultSchema } from "@pen/schema-default";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

export function createPlaygroundEditor() {
	return createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

export function createJsonResponse(payload: unknown): Response {
	return new Response(JSON.stringify(payload), {
		status: 200,
		headers: {
			"content-type": "application/json",
		},
	});
}

export function createTextResponse(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message }), {
		status,
		statusText: status === 409 ? "Conflict" : "Error",
		headers: {
			"content-type": "application/json",
		},
	});
}
