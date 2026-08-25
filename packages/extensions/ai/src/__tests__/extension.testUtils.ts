import { getDocumentToolRuntime } from "@input/pen-document-ops";
import type { ToolRuntime } from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import {
	createModelDouble,
	type ModelDouble,
	type ModelDoubleResponse,
} from "@input/pen-test";

export function scriptedModel(
	response: string | ModelDoubleResponse = " world",
): ModelDouble {
	return createModelDouble({
		responses: [typeof response === "string" ? { text: response } : response],
	});
}

export function testStreamingToolExtension() {
	let toolRuntime: ToolRuntime | null = null;

	return defineExtension({
		name: "test-streaming-tool",
		dependencies: ["document-ops"],
		activateClient: async ({ editor }) => {
			toolRuntime = getDocumentToolRuntime(editor);
			const definition = {
				name: "test_search",
				description: "Test streaming search tool",
				mutating: false,
				inputSchema: {
					type: "object",
					required: ["query"],
					properties: {
						query: { type: "string" },
					},
				},
				async *handler(input: unknown) {
					const { query } = input as { query: string };
					yield `searching:${query}`;
					yield { matches: 2, query };
				},
			};
			toolRuntime?.registerTool(definition);
		},
		deactivateClient: async () => {
			toolRuntime?.unregisterTool("test_search");
			toolRuntime = null;
		},
	});
}

export function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
}

export async function waitForPreview(
	readPreview: () => unknown,
	maxTicks = 10,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (readPreview()) {
			return;
		}
		await Promise.resolve();
	}
}
