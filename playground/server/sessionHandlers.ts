import { createHeadlessEditor } from "@pen/core";
import {
	encodeYjsStateVectorBase64,
	ensureExtensionRoot,
	getYjsDoc,
	readExtensionRoot,
} from "@pen/crdt-yjs";
import { exportPlainText } from "@pen/export-json";
import { defaultPreset } from "@pen/preset-default";
import { createDefaultSchema } from "@pen/schema-default";
import type { Editor } from "@pen/types";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as Y from "yjs";
import { getPlaygroundCollaborationStats } from "./collaborationServer";
import {
	PLAYGROUND_EXTENSION_ROOT_NAMESPACE,
	PLAYGROUND_EXTENSION_ROOT_VERSION,
	SESSION_HEADER,
	logPlaygroundEvent,
} from "./config";
import { formatError, readHeader, readJsonBody, sendJson } from "./http";
import { hydrateEditor } from "./sessionHydration";
import { PlaygroundSessionStore, type PlaygroundSession } from "./sessionStore";
import { parseSerializedEditorState } from "./utils/sessionSyncValidation";
import type {
	SessionCreateResponse,
	SessionDiagnosticsResponse,
	SessionSyncBody,
} from "./types";

export function sendHealth(res: ServerResponse): void {
	sendJson(res, 200, {
		ok: true,
		collaboration: getPlaygroundCollaborationStats(),
	});
}

export function handleNotFound(res: ServerResponse): void {
	sendJson(res, 404, { error: "Not found" });
}

export function createSessionRouteHandlers(
	sessionStore: PlaygroundSessionStore,
) {
	return {
		handleCreateSession(res: ServerResponse): void {
			const session = sessionStore.create();
			logPlaygroundEvent("session:create", { sessionId: session.id });
			sendJson(res, 200, {
				sessionId: session.id,
			} satisfies SessionCreateResponse);
		},

		handleSessionDiagnosticsRequest(
			req: IncomingMessage,
			res: ServerResponse,
			url: URL,
		): void {
			const sessionId =
				url.searchParams.get("sessionId")?.trim() ??
				readHeader(req, SESSION_HEADER);
			if (!sessionId) {
				sendJson(res, 400, {
					error: "Expected a valid playground session ID.",
				});
				return;
			}
			const session = sessionStore.get(sessionId);
			if (!session) {
				sendJson(res, 404, { error: "Playground session not found." });
				return;
			}
			sendJson(res, 200, { ...createSessionDiagnostics(session) });
		},

		async handleSessionSync(
			req: IncomingMessage,
			res: ServerResponse,
		): Promise<void> {
			try {
				await handleSessionSyncRequest(sessionStore, req, res);
			} catch (error) {
				sendJson(res, 500, { error: formatError(error) });
			}
		},
	};
}

export function createPlaygroundEditor(): Editor {
	const editor = createHeadlessEditor({
		preset: defaultPreset({ deltaStream: false, undo: false }),
		schema: createDefaultSchema(),
		documentProfile: "structured",
	});
	ensurePlaygroundExtensionRoot(editor);
	return editor;
}

export function ensurePlaygroundExtensionRoot(editor: Editor) {
	return ensureExtensionRoot({
		doc: getYjsDoc(editor),
		namespace: PLAYGROUND_EXTENSION_ROOT_NAMESPACE,
		version: PLAYGROUND_EXTENSION_ROOT_VERSION,
		shape: { requestIds: "array", diagnostics: "map", notes: "text" },
	});
}

export function recordPlaygroundRequestMetadata(
	session: PlaygroundSession,
	requestId: string,
	requestMode: string,
): void {
	const root = ensurePlaygroundExtensionRoot(session.editor);
	const requestIds = root.map.get("requestIds");
	const diagnostics = root.map.get("diagnostics");
	if (requestIds instanceof Y.Array) requestIds.push([requestId]);
	if (diagnostics instanceof Y.Map) {
		diagnostics.set("lastRequestMode", requestMode);
		diagnostics.set("lastRequestId", requestId);
		diagnostics.set("lastRequestAt", new Date().toISOString());
	}
}

function recordPlaygroundSessionSync(session: PlaygroundSession): void {
	const root = ensurePlaygroundExtensionRoot(session.editor);
	const diagnostics = root.map.get("diagnostics");
	if (diagnostics instanceof Y.Map) {
		diagnostics.set("lastSyncedRevision", session.syncedRevision);
		diagnostics.set("lastSyncedGeneration", session.syncedGeneration);
		diagnostics.set(
			"lastSyncedAt",
			new Date(session.lastSyncedAt ?? Date.now()).toISOString(),
		);
	}
}

function createSessionDiagnostics(
	session: PlaygroundSession,
): SessionDiagnosticsResponse {
	const yDoc = getYjsDoc(session.editor);
	const extensionRoot = readExtensionRoot({
		doc: yDoc,
		namespace: PLAYGROUND_EXTENSION_ROOT_NAMESPACE,
	});
	const rootMap = extensionRoot?.map;
	const requestIds = rootMap?.get("requestIds");
	const diagnostics = rootMap?.get("diagnostics");
	const requestCount = requestIds instanceof Y.Array ? requestIds.length : 0;
	const lastRequestMode =
		diagnostics instanceof Y.Map
			? diagnostics.get("lastRequestMode")
			: null;
	const lastSyncedRevision =
		diagnostics instanceof Y.Map
			? diagnostics.get("lastSyncedRevision")
			: null;
	return {
		sessionId: session.id,
		headless: true,
		blockCount: session.editor.documentState.blockOrder.length,
		generation: session.editor.documentState.generation,
		plainText: exportPlainText(session.editor),
		stateVector: encodeYjsStateVectorBase64(yDoc),
		extensionRoot: {
			namespace:
				extensionRoot?.namespace ?? PLAYGROUND_EXTENSION_ROOT_NAMESPACE,
			version: extensionRoot?.version ?? 0,
			requestCount,
			lastRequestMode:
				typeof lastRequestMode === "string" ? lastRequestMode : null,
			lastSyncedRevision:
				typeof lastSyncedRevision === "number"
					? lastSyncedRevision
					: null,
		},
	};
}

async function handleSessionSyncRequest(
	sessionStore: PlaygroundSessionStore,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const body = (await readJsonBody<SessionSyncBody>(req)) ?? {};
	const sessionId =
		typeof body.sessionId === "string" ? body.sessionId : null;
	const editorState = parseSerializedEditorState(body.editorState);
	const revision =
		typeof body.revision === "number" &&
		Number.isInteger(body.revision) &&
		body.revision >= 0
			? body.revision
			: null;
	const generation =
		typeof body.generation === "number" &&
		Number.isInteger(body.generation) &&
		body.generation >= 0
			? body.generation
			: null;
	if (!sessionId) {
		logPlaygroundEvent("session:sync-rejected", {
			reason: "missing-session-id",
		});
		sendJson(res, 400, {
			error: "Expected a valid playground session ID.",
		});
		return;
	}
	if (!editorState) {
		logPlaygroundEvent("session:sync-rejected", {
			sessionId,
			reason: "missing-editor-state",
		});
		sendJson(res, 400, {
			error: "Expected a serialized editor state payload.",
		});
		return;
	}
	if (revision == null || generation == null) {
		sendJson(res, 400, {
			error: "Expected synchronized revision and generation metadata.",
		});
		return;
	}
	const session = sessionStore.get(sessionId);
	if (!session) {
		logPlaygroundEvent("session:sync-rejected", {
			sessionId,
			reason: "session-not-found",
		});
		sendJson(res, 404, { error: "Playground session not found." });
		return;
	}
	if (session.activeRequestCount > 0) {
		logPlaygroundEvent("session:sync-rejected", {
			sessionId,
			reason: "active-request",
			activeRequestCount: session.activeRequestCount,
		});
		sendJson(res, 409, {
			error: "Cannot sync a playground session while an AI request is active.",
		});
		return;
	}
	const nextEditor = createPlaygroundEditor();
	const clientToServerBlockIds = hydrateEditor(nextEditor, editorState);
	const syncedGeneration = nextEditor.documentState.generation;
	const previousEditor = session.editor;
	session.editor = nextEditor;
	session.clientToServerBlockIds = clientToServerBlockIds;
	session.lastSyncedAt = Date.now();
	session.syncedRevision = revision;
	session.syncedGeneration = syncedGeneration;
	recordPlaygroundSessionSync(session);
	sessionStore.touch(session);
	previousEditor.destroy();
	logPlaygroundEvent("session:sync-complete", {
		sessionId: session.id,
		blockCount: editorState.blockCount,
	});
	sendJson(res, 200, {
		sessionId: session.id,
		lastSyncedAt: session.lastSyncedAt,
		revision: session.syncedRevision,
		generation: session.syncedGeneration,
	});
}
