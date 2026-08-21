import { yjsAdapter } from "@input/pen-crdt-yjs";
import {
	MIGRATION_LEDGER_METADATA_KEY,
	RESERVED_METADATA_KEYS,
	type DocumentOp,
	type Editor,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { defaultSchema } from "./fixtures/testSchema";
import {
	createEditor,
	createHeadlessEditor,
	runMigrations,
	type DocumentMigration,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function insertTextMigration(id: string, text: string): DocumentMigration {
	return {
		id,
		run(editor) {
			const blockId = editor.firstBlock()!.id;
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: editor.getBlock(blockId)!.length(),
					text,
				},
			]);
		},
	};
}

function readLedger(editor: Editor): unknown {
	return editor.internals.doc.metadata.get(MIGRATION_LEDGER_METADATA_KEY);
}

function visibleText(editor: Editor): string {
	return editor.firstBlock()!.textContent().replace(/\u200B/g, "");
}

describe("runMigrations (DUR4)", () => {
	it("DUR4: reserved metadata keys include the migration ledger", () => {
		expect(RESERVED_METADATA_KEYS).toContain(MIGRATION_LEDGER_METADATA_KEY);
		expect(MIGRATION_LEDGER_METADATA_KEY).toBe("penMigrations");
	});

	it("DUR4: applies each migration once and records ids in the ledger", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const migrations = [
			insertTextMigration("add-hello", "Hello"),
			insertTextMigration("add-world", " world"),
		];

		const report = runMigrations(editor, migrations);

		expect(report).toEqual({
			applied: ["add-hello", "add-world"],
			skipped: [],
			failed: [],
		});
		expect(visibleText(editor)).toBe("Hello world");
		expect(readLedger(editor)).toEqual(["add-hello", "add-world"]);

		editor.destroy();
	});

	it("DUR4: a second run is idempotent and skips ledgered ids", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const migrations = [
			insertTextMigration("add-hello", "Hello"),
			insertTextMigration("add-world", " world"),
		];

		const first = runMigrations(editor, migrations);
		const second = runMigrations(editor, migrations);

		expect(first.applied).toEqual(["add-hello", "add-world"]);
		expect(second).toEqual({
			applied: [],
			skipped: ["add-hello", "add-world"],
			failed: [],
		});
		expect(visibleText(editor)).toBe("Hello world");
		expect(readLedger(editor)).toEqual(["add-hello", "add-world"]);

		editor.destroy();
	});

	it("DUR4: a throwing migration isolates its ops and does not stop the list", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const migrations: DocumentMigration[] = [
			insertTextMigration("keep-this", "kept"),
			{
				id: "explode",
				run(editor) {
					const blockId = editor.firstBlock()!.id;
					editor.apply([
						{
							type: "insert-text",
							blockId,
							offset: editor.getBlock(blockId)!.length(),
							text: "gone",
						},
					]);
					throw new Error("migration failed");
				},
			},
			insertTextMigration("after-failure", " after"),
		];

		const report = runMigrations(editor, migrations);

		expect(report.applied).toEqual(["keep-this", "after-failure"]);
		expect(report.skipped).toEqual([]);
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]?.id).toBe("explode");
		expect(report.failed[0]?.error).toEqual(expect.any(Error));
		expect(visibleText(editor)).toBe("kept after");
		expect(readLedger(editor)).toEqual(["keep-this", "after-failure"]);

		editor.destroy();
	});

	it("DUR4: headless and browser editors share one runner and stay byte-comparable", () => {
		const adapter = yjsAdapter();
		const seed = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter });
		const initial = adapter.encodeState(seed.internals.crdtDoc);
		seed.destroy();

		const headless = createHeadlessEditor({
			schema: defaultSchema,crdt: adapter,
			document: adapter.loadDocument(initial),
		});
		const migrations = [insertTextMigration("title", "Title")];
		const headlessReport = runMigrations(headless, migrations);
		const afterHeadless = adapter.encodeState(headless.internals.crdtDoc);

		const browser = createEditor({
			schema: defaultSchema, preset: noDefaultExtensionsPreset,
			crdt: adapter,
			document: adapter.loadDocument(afterHeadless),
		});
		const browserReport = runMigrations(browser, migrations);
		const afterBrowser = adapter.encodeState(browser.internals.crdtDoc);

		expect(headlessReport.applied).toEqual(["title"]);
		expect(browserReport).toEqual({
			applied: [],
			skipped: ["title"],
			failed: [],
		});
		expect(visibleText(headless)).toBe("Title");
		expect(visibleText(browser)).toBe("Title");
		expect(readLedger(headless)).toEqual(["title"]);
		expect(readLedger(browser)).toEqual(["title"]);
		expect(afterBrowser).toEqual(afterHeadless);

		const independent = createEditor({
			schema: defaultSchema, preset: noDefaultExtensionsPreset,
			crdt: adapter,
			document: adapter.loadDocument(initial),
		});
		expect(runMigrations(independent, migrations).applied).toEqual(["title"]);
		expect(visibleText(independent)).toBe("Title");
		expect(readLedger(independent)).toEqual(["title"]);

		headless.destroy();
		browser.destroy();
		independent.destroy();
	});

	it("DUR4: forces origin migration even when the host apply omits it", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const appliedOrigins: unknown[] = [];
		const restore = editor.internals.onApplyBoundary((event) => {
			if (event.phase === "after" && event.applied) {
				appliedOrigins.push(event.origin);
			}
		});

		runMigrations(editor, [
			{
				id: "implicit-origin",
				run(nextEditor) {
					const blockId = nextEditor.firstBlock()!.id;
					const op: DocumentOp = {
						type: "insert-text",
						blockId,
						offset: 0,
						text: "x",
					};
					nextEditor.apply([op]);
				},
			},
		]);

		expect(appliedOrigins).toEqual(["migration"]);
		restore();
		editor.destroy();
	});
});
