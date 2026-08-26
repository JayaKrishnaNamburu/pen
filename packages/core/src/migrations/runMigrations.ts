import {
	MIGRATION_LEDGER_METADATA_KEY,
	type ApplyOptions,
	type DocumentOp,
	type Editor,
} from "@input/pen-types";

import type { DocumentMigration, MigrationReport } from "./types";

const MIGRATION_ORIGIN = "migration" as const;

interface MutableMetadataMap {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
}

function readLedger(editor: Editor): string[] {
	const value = editor.internals.doc.metadata.get(MIGRATION_LEDGER_METADATA_KEY);
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((id): id is string => typeof id === "string");
}

function writeLedger(editor: Editor, ids: readonly string[]): void {
	const metadata = editor.internals.doc.metadata as unknown as MutableMetadataMap;
	metadata.set(MIGRATION_LEDGER_METADATA_KEY, [...ids]);
}

function bindMigrationApply(editor: Editor): () => void {
	const previousApply = editor.apply.bind(editor);
	editor.apply = (ops: DocumentOp[], options?: ApplyOptions) => {
		previousApply(ops, { ...options, origin: MIGRATION_ORIGIN });
	};
	return () => {
		editor.apply = previousApply;
	};
}

function runOneMigration(editor: Editor, migration: DocumentMigration): void {
	const { adapter, crdtDoc } = editor.internals;
	const isolationUndo = adapter.createUndoManager(crdtDoc, {
		trackedOriginTypes: [MIGRATION_ORIGIN],
		captureTimeout: 0,
	});
	const restoreApply = bindMigrationApply(editor);
	try {
		adapter.transact(
			crdtDoc,
			() => {
				migration.run(editor);
				writeLedger(editor, [...readLedger(editor), migration.id]);
			},
			MIGRATION_ORIGIN,
		);
	} catch (error) {
		isolationUndo.undo();
		throw error;
	} finally {
		restoreApply();
		isolationUndo.destroy();
	}
}

export function runMigrations(
	editor: Editor,
	migrations: readonly DocumentMigration[],
): MigrationReport {
	const applied: string[] = [];
	const skipped: string[] = [];
	const failed: { id: string; error: unknown }[] = [];
	const seen = new Set(readLedger(editor));

	for (const migration of migrations) {
		if (seen.has(migration.id)) {
			skipped.push(migration.id);
			continue;
		}

		try {
			runOneMigration(editor, migration);
			applied.push(migration.id);
			seen.add(migration.id);
		} catch (error) {
			failed.push({ id: migration.id, error });
		}
	}

	return { applied, skipped, failed };
}
