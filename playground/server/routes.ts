import type { IncomingMessage, ServerResponse } from "node:http";

export interface PlaygroundRouteConfig {
	skillsRoute: string;
	toolRoutePrefix: string;
	sessionDiagnosticsRoute: string;
}

export interface PlaygroundRouteHandlers {
	sendHealth(res: ServerResponse): void;
	handleAIRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
	handleCreateSession(res: ServerResponse): void;
	handleSessionSync(req: IncomingMessage, res: ServerResponse): Promise<void>;
	handleSessionDiagnosticsRequest(
		req: IncomingMessage,
		res: ServerResponse,
		url: URL,
	): void;
	handleListToolsRequest(req: IncomingMessage, res: ServerResponse): void;
	handleListSkillsRequest(req: IncomingMessage, res: ServerResponse): void;
	handleDirectToolRequest(
		req: IncomingMessage,
		res: ServerResponse,
		url: URL,
	): Promise<void>;
	handleNotFound(res: ServerResponse): void;
}

export async function dispatchPlaygroundRoute(
	req: IncomingMessage,
	res: ServerResponse,
	url: URL,
	config: PlaygroundRouteConfig,
	handlers: PlaygroundRouteHandlers,
): Promise<void> {
	if (url.pathname === "/health") {
		handlers.sendHealth(res);
		return;
	}

	if (url.pathname === "/api/ai" && req.method === "POST") {
		await handlers.handleAIRequest(req, res);
		return;
	}

	if (url.pathname === "/api/ai/session" && req.method === "POST") {
		handlers.handleCreateSession(res);
		return;
	}

	if (url.pathname === "/api/ai/session/sync" && req.method === "POST") {
		await handlers.handleSessionSync(req, res);
		return;
	}

	if (
		url.pathname === config.sessionDiagnosticsRoute &&
		req.method === "GET"
	) {
		handlers.handleSessionDiagnosticsRequest(req, res, url);
		return;
	}

	if (url.pathname === "/api/tools" && req.method === "GET") {
		handlers.handleListToolsRequest(req, res);
		return;
	}

	if (url.pathname === config.skillsRoute && req.method === "GET") {
		handlers.handleListSkillsRequest(req, res);
		return;
	}

	if (
		url.pathname.startsWith(config.toolRoutePrefix) &&
		req.method === "POST"
	) {
		await handlers.handleDirectToolRequest(req, res, url);
		return;
	}

	handlers.handleNotFound(res);
}
