import { jsonSchema, tool } from "ai";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Editor, ToolRuntime } from "@pen/types";
import { getAutocompleteController } from "@pen/ai-autocomplete";
import {
	AIToolContextImpl,
	executeAITool,
	getAIToolRuntime,
	listAITools,
} from "@pen/ai-tools";
import { listDefaultAISkills, renderSkillFiles } from "@pen/ai-skills";
import {
	PLAYGROUND_DIRECT_TOOL_NAMES,
	PLAYGROUND_TOOL_ROUTE_PREFIX,
} from "./config";
import { formatError, readHeader, readJsonBody, sendJson } from "./http";
import { PlaygroundSessionStore } from "./sessionStore";
import { SESSION_HEADER } from "./config";
import type { PlaygroundRequestMetrics, ToolExecuteBody } from "./types";

export function createToolRouteHandlers(sessionStore: PlaygroundSessionStore) {
	return {
		handleListToolsRequest(
			req: IncomingMessage,
			res: ServerResponse,
		): void {
			const resolved = resolvePlaygroundToolRuntime(sessionStore, req);
			if (!resolved) {
				sendJson(res, 404, {
					error: "No active playground session matched this tool request.",
				});
				return;
			}
			sendJson(res, 200, { tools: listAITools(resolved.toolRuntime) });
		},

		handleListSkillsRequest(
			req: IncomingMessage,
			res: ServerResponse,
		): void {
			const resolved = resolvePlaygroundToolRuntime(sessionStore, req);
			if (!resolved) {
				sendJson(res, 404, {
					error: "No active playground session matched this skill request.",
				});
				return;
			}
			const skills = listDefaultAISkills(
				listAITools(resolved.toolRuntime),
				{
					autocompleteProviders:
						getAutocompleteController(
							resolved.editor,
						)?.listProviderDescriptors() ?? [],
				},
			);
			sendJson(res, 200, {
				skills: skills.map((skill) => ({
					name: skill.name,
					title: skill.title,
					description: skill.description,
					files: renderSkillFiles(skill),
				})),
			});
		},

		async handleDirectToolRequest(
			req: IncomingMessage,
			res: ServerResponse,
			url: URL,
		): Promise<void> {
			const resolved = resolvePlaygroundToolRuntime(sessionStore, req);
			if (!resolved) {
				sendJson(res, 404, {
					error: "No active playground session matched this tool request.",
				});
				return;
			}
			const toolName = decodeURIComponent(
				url.pathname.slice(PLAYGROUND_TOOL_ROUTE_PREFIX.length),
			);
			if (!toolName) {
				sendJson(res, 400, { error: "Expected a valid tool name." });
				return;
			}
			const body = (await readJsonBody<ToolExecuteBody>(req)) ?? {};
			const context = new AIToolContextImpl(
				resolved.editor,
				"playground",
				() => {
					/* Native tool endpoint returns final JSON responses only. */
				},
			);
			try {
				const output = await executeAITool(
					resolved.toolRuntime,
					toolName,
					body.input ?? {},
					context,
				);
				sendJson(res, 200, { toolName, output });
			} catch (error) {
				sendJson(res, 400, { error: formatError(error), toolName });
			}
		},
	};
}

function resolvePlaygroundToolRuntime(
	sessionStore: PlaygroundSessionStore,
	req: IncomingMessage,
): { editor: Editor; toolRuntime: ToolRuntime } | null {
	const sessionId = readHeader(req, SESSION_HEADER);
	const session = sessionStore.get(sessionId);
	const editor = session?.editor ?? null;
	if (!editor) return null;
	const toolRuntime = getAIToolRuntime(editor);
	if (!toolRuntime) return null;
	return { editor, toolRuntime };
}

export function buildPlaygroundTools(
	editor: Editor,
	metrics: PlaygroundRequestMetrics,
): Record<string, ReturnType<typeof tool>> {
	const toolRuntime = getAIToolRuntime(editor);
	if (!toolRuntime) {
		return {};
	}

	const context = new AIToolContextImpl(editor, "playground", () => {
		/* Server-side tool execution streams metrics, not editor deltas */
	});

	return toolRuntime
		.listTools()
		.reduce<
			Record<string, ReturnType<typeof tool>>
		>((accumulator, definition) => {
			if (!PLAYGROUND_DIRECT_TOOL_NAMES.has(definition.name)) {
				return accumulator;
			}

			accumulator[definition.name] = {
				description: definition.description,
				inputSchema: jsonSchema(
					definition.inputSchema as Record<string, unknown>,
				),
				execute: async (input: unknown) => {
					const startedAt = performance.now();
					const result = await executeAITool(
						toolRuntime,
						definition.name,
						input,
						context,
					);
					metrics.toolExecutionMs += performance.now() - startedAt;
					if (metrics.firstToolResultMs == null) {
						metrics.firstToolResultMs =
							performance.now() - metrics.startedAt;
					}
					return result;
				},
			} as unknown as ReturnType<typeof tool>;
			return accumulator;
		}, {});
}
