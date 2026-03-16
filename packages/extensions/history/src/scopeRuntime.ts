import type { Editor } from "@pen/types";
import { HistoryControllerImpl } from "./controller";
import type { HistoryConfig } from "./types";

const runtimesByOwner = new WeakMap<object, Map<string, HistoryScopeRuntime>>();

export interface HistoryScopeRuntimeHandle {
	readonly controller: HistoryControllerImpl;
	readonly ready: Promise<void>;
	dispose(): void;
}

export function attachHistoryScopeRuntime(
	editor: Editor,
	config: HistoryConfig,
): HistoryScopeRuntimeHandle {
	const scopeOwner = resolveScopeOwner(editor);
	const scopeId = editor.internals.documentScope.id;
	let runtimeMap = runtimesByOwner.get(scopeOwner);
	if (!runtimeMap) {
		runtimeMap = new Map<string, HistoryScopeRuntime>();
		runtimesByOwner.set(scopeOwner, runtimeMap);
	}

	let runtime = runtimeMap.get(scopeId);
	if (!runtime) {
		runtime = new HistoryScopeRuntime(editor, config);
		runtimeMap.set(scopeId, runtime);
	}

	runtime.attachEditor(editor);

	return {
		controller: runtime.controller,
		ready: runtime.ready,
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

class HistoryScopeRuntime {
	readonly controller: HistoryControllerImpl;
	readonly ready: Promise<void>;

	constructor(editor: Editor, config: HistoryConfig) {
		this.controller = new HistoryControllerImpl({
			editor,
			persistence: config.persistence,
			docId: config.docId,
			autoSnapshot: config.autoSnapshot,
		});
		this.ready = this.controller.listSnapshots().then(() => {});
	}

	attachEditor(editor: Editor): void {
		this.controller.attachEditor(editor);
	}

	detachEditor(editor: Editor): void {
		this.controller.detachEditor(editor);
	}

	isIdle(): boolean {
		return this.controller.isIdle();
	}

	destroy(): void {
		this.controller.destroy();
	}
}

function resolveScopeOwner(editor: Editor): object {
	return editor.internals.documentSession ?? editor;
}
