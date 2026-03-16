import type {
	Awareness,
	Editor,
	MultiplayerSession,
	SelectionState,
	Unsubscribe,
} from "@pen/types";
import { MultiplayerControllerImpl } from "./controller";
import { AuthorLedger } from "./presence/authorLedger";
import { ClientIdentityMap } from "./presence/identityMap";
import type {
	MultiplayerAwarenessState,
	MultiplayerConfig,
	MultiplayerUser,
} from "./types";

const runtimesByOwner = new WeakMap<object, Map<string, MultiplayerScopeRuntime>>();

export interface MultiplayerScopeRuntimeHandle {
	readonly controller: MultiplayerControllerImpl;
	dispose(): void;
}

export function attachMultiplayerScopeRuntime(
	editor: Editor,
	config: MultiplayerConfig,
	user: MultiplayerUser,
	buildLocalAwarenessState: (
		user: MultiplayerAwarenessState["user"],
		selection: SelectionState,
	) => MultiplayerAwarenessState,
): MultiplayerScopeRuntimeHandle {
	const scopeOwner = resolveScopeOwner(editor);
	const scopeId = editor.internals.documentScope.id;
	let runtimeMap = runtimesByOwner.get(scopeOwner);
	if (!runtimeMap) {
		runtimeMap = new Map<string, MultiplayerScopeRuntime>();
		runtimesByOwner.set(scopeOwner, runtimeMap);
	}

	let runtime = runtimeMap.get(scopeId);
	if (!runtime) {
		runtime = new MultiplayerScopeRuntime({
			editor,
			config,
			user,
			buildLocalAwarenessState,
		});
		runtimeMap.set(scopeId, runtime);
	}

	runtime.attachEditor(editor);

	return {
		controller: runtime.controller,
		dispose() {
			runtime?.detachEditor(editor);
			if (runtime?.isIdle()) {
				runtime.destroy();
				runtimeMap?.delete(scopeId);
			}
			runtime = undefined;
		},
	};
}

interface MultiplayerScopeRuntimeOptions {
	editor: Editor;
	config: MultiplayerConfig;
	user: MultiplayerUser;
	buildLocalAwarenessState: (
		user: MultiplayerAwarenessState["user"],
		selection: SelectionState,
	) => MultiplayerAwarenessState;
}

class MultiplayerScopeRuntime {
	readonly controller: MultiplayerControllerImpl;

	private readonly awareness: Awareness;
	private readonly buildLocalAwarenessState: (
		user: MultiplayerAwarenessState["user"],
		selection: SelectionState,
	) => MultiplayerAwarenessState;
	private readonly editors = new Set<Editor>();
	private readonly selectionUnsubscribers = new Map<Editor, Unsubscribe>();
	private readonly session: MultiplayerSession | null;
	private readonly unsubscribeSessionState: Unsubscribe | null;
	private readonly user: MultiplayerUser;

	constructor(options: MultiplayerScopeRuntimeOptions) {
		const { editor, config, user, buildLocalAwarenessState } = options;
		const awareness = editor.internals.awareness;
		if (!awareness) {
			throw new Error("Multiplayer extension requires CRDT awareness");
		}

		this.awareness = awareness;
		this.user = user;
		this.buildLocalAwarenessState = buildLocalAwarenessState;
		this.controller = new MultiplayerControllerImpl({
			editor,
			config: {
				...config,
				user,
			},
			authorLedger: new AuthorLedger(),
			identityMap: new ClientIdentityMap({
				resolvePeerIdentity: config.resolvePeerIdentity,
			}),
		});
		this.awareness.setLocalState(
			this.buildLocalAwarenessState(user, editor.selection),
		);
		this.controller.handleAwarenessChange(
			this.awareness.getStates() as Map<number, MultiplayerAwarenessState>,
		);

		this.awareness.on("change", this.handleAwarenessChange);

		this.session =
			config.session ??
			config.sessionFactory?.({
				editor,
				awareness: this.awareness,
			}) ??
			null;
		this.unsubscribeSessionState = this.session
			? this.session.onStateChange((state) => {
					this.controller.setConnectionState(state);
				})
			: null;

		if (this.session) {
			this.controller.setConnectionLifecycleHandlers({
				connect: () => this.session?.connect(),
				disconnect: () => this.session?.disconnect(),
			});
			this.controller.setConnectionState(this.session.connectionState);
			if (config.autoConnect !== false) {
				this.controller.connect();
			}
		}
	}

	attachEditor(editor: Editor): void {
		if (this.editors.has(editor)) {
			return;
		}

		this.editors.add(editor);
		this.selectionUnsubscribers.set(
			editor,
			editor.onSelectionChange((selection) => {
				this.awareness.setLocalState(
					this.buildLocalAwarenessState(this.user, selection),
				);
			}),
		);
		editor.requestDecorationUpdate();
	}

	detachEditor(editor: Editor): void {
		this.selectionUnsubscribers.get(editor)?.();
		this.selectionUnsubscribers.delete(editor);
		this.editors.delete(editor);

		const remainingEditor = this.editors.values().next().value as
			| Editor
			| undefined;
		if (!remainingEditor) {
			this.awareness.setLocalState(null);
			return;
		}
		this.awareness.setLocalState(
			this.buildLocalAwarenessState(this.user, remainingEditor.selection),
		);
	}

	isIdle(): boolean {
		return this.editors.size === 0;
	}

	destroy(): void {
		this.awareness.setLocalState(null);
		for (const unsubscribe of this.selectionUnsubscribers.values()) {
			unsubscribe();
		}
		this.selectionUnsubscribers.clear();
		this.editors.clear();
		this.unsubscribeSessionState?.();
		this.session?.destroy();
		this.awareness.off("change", this.handleAwarenessChange);
		this.controller.destroy();
	}

	private readonly handleAwarenessChange = (): void => {
		this.controller.handleAwarenessChange(
			this.awareness.getStates() as Map<number, MultiplayerAwarenessState>,
		);
		for (const editor of this.editors) {
			editor.requestDecorationUpdate();
		}
	};
}

function resolveScopeOwner(editor: Editor): object {
	return editor.internals.documentSession ?? editor;
}
