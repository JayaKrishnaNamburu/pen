import type { DiagnosticEvent, Editor, Unsubscribe } from "@pen/types";
import type { AutoSnapshotConfig } from "../types";
import { SnapshotManager } from "./snapshotManager";

const DEFAULT_AUTO_SNAPSHOT_CONFIG: Required<AutoSnapshotConfig> = {
	intervalMs: 5 * 60_000,
	opThreshold: 100,
	onSessionStart: true,
	onAIGeneration: true,
};

export class AutoSnapshotScheduler {
	private editor: Editor;
	private readonly manager: SnapshotManager;
	private readonly config: Required<AutoSnapshotConfig>;
	private readonly cleanup: Unsubscribe[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;
	private opsSinceSnapshot = 0;

	constructor(
		editor: Editor,
		manager: SnapshotManager,
		config: AutoSnapshotConfig = {},
	) {
		this.editor = editor;
		this.manager = manager;
		this.config = {
			...DEFAULT_AUTO_SNAPSHOT_CONFIG,
			...config,
		};

		if (this.config.onSessionStart) {
			void this.safeCreateSnapshot("Session start", "auto");
		}

		this.timer = setInterval(() => {
			void this.safeCreateSnapshot(undefined, "auto");
			this.opsSinceSnapshot = 0;
		}, this.config.intervalMs);

		this.bindEditor(editor);
	}

	updateEditor(editor: Editor): void {
		if (this.editor === editor) {
			return;
		}
		this.unbindEditor();
		this.editor = editor;
		this.bindEditor(editor);
	}

	private bindEditor(editor: Editor): void {
		this.cleanup.push(
			editor.onDocumentCommit(() => {
				this.opsSinceSnapshot += 1;
				if (this.opsSinceSnapshot < this.config.opThreshold) {
					return;
				}

				this.opsSinceSnapshot = 0;
				void this.safeCreateSnapshot(undefined, "auto");
			}),
		);

		this.cleanup.push(
			editor.on("diagnostic", (...args: unknown[]) => {
				const [event] = args as [DiagnosticEvent];
				if (
					event?.code === "GENERATION_COMPLETE" &&
					this.config.onAIGeneration
				) {
					void this.safeCreateSnapshot("Pre-AI generation", "ai-generation");
				}
			}),
		);
	}

	private unbindEditor(): void {
		for (const unsubscribe of this.cleanup) {
			unsubscribe();
		}
		this.cleanup.length = 0;
	}

	triggerAISnapshot(): Promise<void> {
		if (!this.config.onAIGeneration) {
			return Promise.resolve();
		}

		return this.safeCreateSnapshot("Pre-AI generation", "ai-generation");
	}

	destroy(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}

		this.unbindEditor();
	}

	private async safeCreateSnapshot(
		label: string | undefined,
		trigger: "auto" | "ai-generation",
	): Promise<void> {
		try {
			await this.manager.createSnapshot(label, trigger);
		} catch (error) {
			this.editor.internals.emit("diagnostic", {
				code: "HISTORY_SNAPSHOT_FAILED",
				level: "error",
				source: "history",
				message: "Failed to create automatic history snapshot.",
				error,
			});
		}
	}
}
