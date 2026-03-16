import type {
	Editor,
	Extension,
	SelectionState,
} from "@pen/types";
import {
	defineExtension,
	MULTIPLAYER_CONTROLLER_SLOT,
} from "@pen/types";
import { createDecorationSet } from "@pen/core";
import type { MultiplayerControllerImpl } from "./controller";
import { buildRemoteCursorDecorations } from "./decorations/remoteCursors";
import { buildRemoteSelectionDecorations } from "./decorations/remoteSelections";
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
export { MULTIPLAYER_CONTROLLER_SLOT };

export function multiplayerExtension(config: MultiplayerConfig): Extension {
	let activeEditor: Editor | null = null;
	let controller: MultiplayerControllerImpl | null = null;
	let runtimeHandle: MultiplayerScopeRuntimeHandle | null = null;

	return defineExtension({
		name: MULTIPLAYER_EXTENSION_NAME,

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
			editor.internals.setSlot(MULTIPLAYER_CONTROLLER_SLOT, controller);
		},

		deactivateClient: async () => {
			runtimeHandle?.dispose();
			runtimeHandle = null;
			activeEditor?.internals.setSlot(MULTIPLAYER_CONTROLLER_SLOT, null);
			controller = null;
			activeEditor = null;
		},

		decorations: (_state, editor) => {
			const cursorDecorations = buildRemoteCursorDecorations(
				controller?.getRemoteCursors() ?? [],
			);
			const selectionDecorations = buildRemoteSelectionDecorations(
				editor,
				controller?.getRemoteSelections() ?? [],
			);
			return createDecorationSet([
				...cursorDecorations,
				...selectionDecorations,
			]);
		},
	});
}

export function getMultiplayerController(
	editor: Editor,
): MultiplayerController | null {
	return (
		editor.internals.getSlot<MultiplayerController>(
			MULTIPLAYER_CONTROLLER_SLOT,
		) ?? null
	);
}

function buildLocalAwarenessState(
	user: MultiplayerAwarenessState["user"],
	selection: SelectionState,
): MultiplayerAwarenessState {
	if (selection?.type === "text") {
		return {
			user,
			cursor: {
				blockId: selection.focus.blockId,
				offset: selection.focus.offset,
				clock: Date.now(),
			},
			selection: {
				anchor: selection.anchor,
				head: {
					blockId: selection.focus.blockId,
					offset: selection.focus.offset,
				},
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
