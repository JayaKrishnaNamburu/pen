import { config as loadEnv } from "dotenv";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import {
	PLAYGROUND_COLLAB_DEFAULT_DOC_NAME,
	PLAYGROUND_COLLAB_ROUTE_PREFIX,
	PLAYGROUND_SERVER_HOST,
	PLAYGROUND_SERVER_PORT,
	PLAYGROUND_SESSION_CLEANUP_INTERVAL_MS,
	PLAYGROUND_SESSION_DIAGNOSTICS_ROUTE,
	PLAYGROUND_SESSION_TTL_MS,
	PLAYGROUND_SKILLS_ROUTE,
	PLAYGROUND_TOOL_ROUTE_PREFIX,
	logPlaygroundEvent,
} from "./config";
import {
	createPlaygroundCollaborationServer,
	handleCollaborationUpgrade,
} from "./collaborationServer";
import { formatError, sendJson } from "./http";
import { dispatchPlaygroundRoute } from "./routes";
import { createAIRequestHandler } from "./aiRequestHandler";
import {
	createPlaygroundEditor,
	createSessionRouteHandlers,
	handleNotFound,
	sendHealth,
} from "./sessionHandlers";
import { PlaygroundSessionStore } from "./sessionStore";
import { createToolRouteHandlers } from "./toolHandlers";

loadEnv({
	path: fileURLToPath(new URL("../.env.local", import.meta.url)),
});

const sessionStore = new PlaygroundSessionStore({
	createEditor: createPlaygroundEditor,
	ttlMs: PLAYGROUND_SESSION_TTL_MS,
	onExpire: (session) => {
		logPlaygroundEvent("session:expired", { sessionId: session.id });
	},
});
const serverOrigin = `http://${PLAYGROUND_SERVER_HOST}:${PLAYGROUND_SERVER_PORT}`;
const sessionCleanupTimer = setInterval(
	() => sessionStore.cleanupIdle(),
	PLAYGROUND_SESSION_CLEANUP_INTERVAL_MS,
);
sessionCleanupTimer.unref?.();

const collaborationWebSocketServer = createPlaygroundCollaborationServer({
	routePrefix: PLAYGROUND_COLLAB_ROUTE_PREFIX,
	defaultDocName: PLAYGROUND_COLLAB_DEFAULT_DOC_NAME,
});
const sessionHandlers = createSessionRouteHandlers(sessionStore);
const toolHandlers = createToolRouteHandlers(sessionStore);
const handleAIRequest = createAIRequestHandler(sessionStore);

const server = createServer(async (req, res) => {
	try {
		const url = new URL(req.url ?? "/", serverOrigin);
		await dispatchPlaygroundRoute(
			req,
			res,
			url,
			{
				skillsRoute: PLAYGROUND_SKILLS_ROUTE,
				toolRoutePrefix: PLAYGROUND_TOOL_ROUTE_PREFIX,
				sessionDiagnosticsRoute: PLAYGROUND_SESSION_DIAGNOSTICS_ROUTE,
			},
			{
				sendHealth,
				handleAIRequest,
				handleCreateSession: sessionHandlers.handleCreateSession,
				handleSessionSync: sessionHandlers.handleSessionSync,
				handleSessionDiagnosticsRequest:
					sessionHandlers.handleSessionDiagnosticsRequest,
				handleListToolsRequest: toolHandlers.handleListToolsRequest,
				handleListSkillsRequest: toolHandlers.handleListSkillsRequest,
				handleDirectToolRequest: toolHandlers.handleDirectToolRequest,
				handleNotFound,
			},
		);
	} catch (error) {
		sendJson(res, 500, { error: formatError(error) });
	}
});

let isShuttingDown = false;
server.on("error", (error) => {
	console.error("Pen playground AI backend server error:", error);
});
server.on("upgrade", (request, socket, head) => {
	handleCollaborationUpgrade(
		collaborationWebSocketServer,
		{
			routePrefix: PLAYGROUND_COLLAB_ROUTE_PREFIX,
			defaultDocName: PLAYGROUND_COLLAB_DEFAULT_DOC_NAME,
		},
		request,
		socket,
		head,
	);
});
server.listen(PLAYGROUND_SERVER_PORT, PLAYGROUND_SERVER_HOST, () => {
	console.log(`Pen playground AI backend listening on ${serverOrigin}`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.once(signal, () => shutdownPlaygroundServer(signal));
}

function shutdownPlaygroundServer(signal: NodeJS.Signals): void {
	if (isShuttingDown) return;
	isShuttingDown = true;
	logPlaygroundEvent("server:shutdown", { signal });
	const exitTimer = setTimeout(() => process.exit(), 5_000);
	exitTimer.unref?.();
	server.close((error) => {
		collaborationWebSocketServer.close();
		clearTimeout(exitTimer);
		if (error) {
			console.error(
				"Failed to close playground AI backend cleanly:",
				error,
			);
			process.exit(1);
			return;
		}
		process.exit();
	});
}
