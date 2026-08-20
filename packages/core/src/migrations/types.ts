import type { Editor } from "@input/pen-types";

export interface DocumentMigration {
	readonly id: string; // stable identifier, recorded in the ledger
	run(editor: Editor): void; // applies ops via editor.apply; must be idempotent
}

export interface MigrationReport {
	readonly applied: readonly string[];
	readonly skipped: readonly string[]; // already in the ledger
	readonly failed: readonly { id: string; error: unknown }[];
}
