import { defineExtension, type ToolRuntime } from "@pen/types";

export function testStreamingToolExtension() {
	let toolRuntime: ToolRuntime | null = null;

	return defineExtension({
		name: "test-streaming-tool",
		dependencies: ["document-ops"],
		activateClient: async ({ editor }) => {
			toolRuntime = editor.internals.getSlot<ToolRuntime>("document-ops:toolRuntime") ?? null;
			toolRuntime?.registerTool({
				name: "test_search",
				description: "Test streaming search tool",
				inputSchema: {
					type: "object",
					required: ["query"],
					properties: {
						query: { type: "string" },
					},
				},
				async *handler(input) {
					const { query } = input as { query: string };
					yield `searching:${query}`;
					yield { matches: 2, query };
				},
			});
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
