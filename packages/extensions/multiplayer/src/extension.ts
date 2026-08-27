import type {
	Editor,
	Extension,
	SelectionRecord,
	SelectionState,
} from "@input/pen-types";
import { MULTIPLAYER_CONTROLLER_SLOT } from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import {
	createDecorationSet,
	decorationsFacet,
	multiplayerControllerFacet,
} from "@input/pen-core";
import type { MultiplayerControllerImpl } from "./controller";
import { buildRemoteCursorDecorations } from "./decorations/remoteCursors";
import { buildRemoteSelectionDecorations } from "./decorations/remoteSelections";
import { buildRemoteStreamingDecorations } from "./decorations/remoteStreaming";
import {
	assignMultiplayerColor,
	normalizeMultiplayerColor,
} from "./presence/colorAssignment";
import {
	attachMultiplayerScopeRuntime,
	type MultiplayerScopeRuntimeHandle,
} from "./scopeRuntime";
import type {
	MultiplayerAwarenessState,
	MultiplayerConfig,
	MultiplayerController,
	MultiplayerUser,
	ResolvePeerIdentityContext,
} from "./types";

export const MULTIPLAYER_EXTENSION_NAME = "multiplayer";

export function multiplayerExtension(config: MultiplayerConfig): Extension {
	let activeEditor: Editor | null = null;
	let controller: MultiplayerControllerImpl | null = null;
	let runtimeHandle: MultiplayerScopeRuntimeHandle | null = null;

	return defineExtension({
		name: MULTIPLAYER_EXTENSION_NAME,
		facets: [
			decorationsFacet.of((_state, editor) => {
				const cursorDecorations = buildRemoteCursorDecorations(
					controller?.getRemoteCursors() ?? [],
				);
				const selectionDecorations = buildRemoteSelectionDecorations(
					editor,
					controller?.getRemoteSelections() ?? [],
				);
				const streamingDecorations = buildRemoteStreamingDecorations(
					controller?.getRemoteStreaming() ?? [],
				);
				return createDecorationSet([
					...cursorDecorations,
					...selectionDecorations,
					...streamingDecorations,
				]);
			}),
		],

		activateClient: async ({ editor }) => {
			activeEditor = editor;
			const user = resolveLocalUser(config.user, config, editor.clientId);
			runtimeHandle = attachMultiplayerScopeRuntime(
				editor,
				config,
				user,
				buildLocalAwarenessState,
			);
			controller = runtimeHandle.controller;
			editor.internals.assignSlot(MULTIPLAYER_CONTROLLER_SLOT, controller);
		},

		deactivateClient: async () => {
			runtimeHandle?.dispose();
			runtimeHandle = null;
			activeEditor?.internals.assignSlot(MULTIPLAYER_CONTROLLER_SLOT, null);
			controller = null;
			activeEditor = null;
		},
	});
}

export function getMultiplayerController(
	editor: Editor,
): MultiplayerController | null {
	return (
		(editor.facet(multiplayerControllerFacet) as MultiplayerController | null) ??
		null
	);
}

function buildLocalAwarenessState(
	editor: Editor,
	user: MultiplayerAwarenessState["user"],
	selection: SelectionState | SelectionRecord["state"],
): MultiplayerAwarenessState {
	if (selection?.type === "text") {
		const collapsed =
			selection.anchor.blockId === selection.focus.blockId &&
			selection.anchor.offset === selection.focus.offset;
		const cursorAnchor = editor.anchors.create(selection.focus, 1);
		const rangeAnchor = editor.anchors.create(
			selection.anchor,
			collapsed ? 1 : -1,
		);
		const rangeHead = editor.anchors.create(selection.focus, 1);
		if (!cursorAnchor || !rangeAnchor || !rangeHead) {
			return { user, cursor: null, selection: null };
		}
		return {
			user,
			cursor: {
				anchor: editor.anchors.serialize(cursorAnchor),
				clock: Date.now(),
			},
			selection: {
				anchor: editor.anchors.serialize(rangeAnchor),
				head: editor.anchors.serialize(rangeHead),
				clock: Date.now(),
			},
		};
	}

	if (selection?.type === "block") {
		return {
			user,
			cursor: null,
			selection: {
				kind: "block",
				blockIds: [...selection.blockIds],
				clock: Date.now(),
			},
		};
	}

	// no cursor: a grid has no caret position to publish, and the occupied
	// cells are what peers render.
	if (selection?.type === "cell") {
		return {
			user,
			cursor: null,
			selection: {
				kind: "cell",
				blockId: selection.blockId,
				anchor: {
					row: selection.anchor.row,
					col: selection.anchor.col,
				},
				head: { row: selection.head.row, col: selection.head.col },
				clock: Date.now(),
			},
		};
	}

	return {
		user,
		cursor: null,
		selection: null,
	};
}

function resolveLocalUser(
	user: MultiplayerUser,
	config: MultiplayerConfig,
	clientId: number,
): MultiplayerUser {
	const defaultColor = assignMultiplayerColor(user.id);
	const context: ResolvePeerIdentityContext = {
		clientId,
		source: "local-config",
		awareness: null,
		defaultColor,
	};
	const resolvedUser = config.resolvePeerIdentity
		? config.resolvePeerIdentity(user, context)
		: user;

	return {
		...resolvedUser,
		color: normalizeMultiplayerColor(resolvedUser.color, defaultColor),
	};
}
