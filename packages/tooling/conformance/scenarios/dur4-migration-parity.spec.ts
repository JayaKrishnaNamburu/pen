import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import {
	createHeadlessEditor,
	runMigrations,
	type DocumentMigration,
	type MigrationReport,
} from "@input/pen-core";
import { yjsAdapter } from "@input/pen-crdt-yjs";
import { defaultSchema } from "@input/pen-schema-default";
import { ASSERT_DOC_EQUALS_FIELDS, assertDocEquals } from "@input/pen-test";
import type { Editor } from "@input/pen-types";
import type { Session } from "../harness/src/session";
import { formatCheckReport } from "../src/checkReport";
import { scenario } from "../src/scenario";

const CORE_HREF = `/@fs${fileURLToPath(new URL("../../../../packages/core/src/index.ts", import.meta.url))}`;
const SESSION_HREF = "/src/session.ts";

const EXPECTED_APPLIED = [
	"dur4-insert-suffix",
	"dur4-mark-hello",
	"dur4-unknown-prop",
	"dur4-nested-child",
	"dur4-table",
	"dur4-host-app",
	"dur4-host-metadata",
] as const;

type MountedSession = Pick<Session, "editor" | "disconnectPeers">;

function expectCheck(check: string, ok: boolean, detail?: string): void {
	expect(
		ok,
		formatCheckReport(check, ok ? "passed" : "failed", ok ? undefined : detail),
	).toBe(true);
}

function createParityMigrations(): DocumentMigration[] {
	return [
		{
			id: "dur4-insert-suffix",
			run(editor) {
				const blockId = editor.firstBlock()!.id;
				editor.apply([
					{
						type: "insert-text",
						blockId,
						offset: editor.getBlock(blockId)!.length(),
						text: " · upgraded",
					},
				]);
			},
		},
		{
			id: "dur4-mark-hello",
			run(editor) {
				const blockId = editor.firstBlock()!.id;
				editor.apply([
					{
						type: "format-text",
						blockId,
						offset: 0,
						length: 5,
						marks: { bold: true },
					},
				]);
			},
		},
		{
			id: "dur4-unknown-prop",
			run(editor) {
				editor.apply([
					{
						type: "update-block",
						blockId: editor.firstBlock()!.id,
						props: { hostAnnotation: "keep-me" },
					},
				]);
			},
		},
		{
			id: "dur4-nested-child",
			run(editor) {
				editor.apply([
					{
						type: "insert-block",
						blockId: "dur4-toggle",
						blockType: "toggle",
						props: {},
						position: "last",
					},
					{
						type: "insert-text",
						blockId: "dur4-toggle",
						offset: 0,
						text: "Nest",
					},
					{
						type: "insert-block",
						blockId: "dur4-child",
						blockType: "paragraph",
						props: {},
						position: { parent: "dur4-toggle", index: 0 },
					},
					{
						type: "insert-text",
						blockId: "dur4-child",
						offset: 0,
						text: "nested child",
					},
				]);
			},
		},
		{
			id: "dur4-table",
			run(editor) {
				editor.apply([
					{
						type: "insert-block",
						blockId: "dur4-table",
						blockType: "table",
						props: {},
						position: "last",
					},
					{
						type: "insert-table-cell-text",
						blockId: "dur4-table",
						row: 0,
						col: 0,
						offset: 0,
						text: "cell-a",
					},
					{
						type: "format-table-cell-text",
						blockId: "dur4-table",
						row: 0,
						col: 0,
						offset: 0,
						length: 6,
						marks: { italic: true },
					},
				]);
			},
		},
		{
			id: "dur4-host-app",
			run(editor) {
				editor.apply([
					{
						type: "create-app",
						appId: "dur4-host-app",
						appType: "host",
						config: { keep: true },
						placement: {
							mode: "anchored",
							blockId: editor.firstBlock()!.id,
							anchor: "after",
						},
					},
				]);
			},
		},
		{
			id: "dur4-host-metadata",
			run(editor) {
				const metadata = editor.internals.doc.metadata as unknown as {
					set(key: string, value: unknown): void;
				};
				metadata.set("hostNote", "parity");
			},
		},
	];
}

function editorFromEncodedState(bytes: Uint8Array): Editor {
	const adapter = yjsAdapter();
	return createHeadlessEditor({
		schema: defaultSchema,
		documentProfile: "structured",
		crdt: adapter,
		document: adapter.loadDocument(bytes),
	});
}

async function importMountedSession(page: Page): Promise<void> {
	const imported = await page.evaluate(async (sessionHref) => {
		const sessionMod = (await import(sessionHref)) as {
			getHarnessSession?: () => MountedSession;
		};
		return typeof sessionMod.getHarnessSession === "function";
	}, SESSION_HREF);
	expectCheck(
		"DUR4: mounted session is importable from the live harness",
		imported,
		imported ? undefined : `failed to import getHarnessSession from ${SESSION_HREF}`,
	);
}

async function disconnectAndEncodeMounted(page: Page): Promise<Uint8Array> {
	const bytes = await page.evaluate(async (sessionHref) => {
		const { getHarnessSession } = (await import(sessionHref)) as {
			getHarnessSession: () => MountedSession;
		};
		const session = getHarnessSession();
		session.disconnectPeers();
		return Array.from(
			session.editor.internals.adapter.encodeState(
				session.editor.internals.crdtDoc,
			),
		);
	}, SESSION_HREF);
	return Uint8Array.from(bytes);
}

async function runMigrationsOnMounted(page: Page): Promise<MigrationReport> {
	return page.evaluate(
		async ({ coreHref, sessionHref, factorySource }) => {
			const { runMigrations: runMounted } = (await import(coreHref)) as {
				runMigrations: typeof runMigrations;
			};
			const { getHarnessSession } = (await import(sessionHref)) as {
				getHarnessSession: () => MountedSession;
			};
			// The parity claim requires the same migration bodies to run in Node and in
			// the page, and page.evaluate cannot close over a function reference. The
			// factory is therefore serialized and rebuilt here, which only works while
			// createParityMigrations references nothing from its module scope — a
			// module-scope reference would survive typecheck and fail as a ReferenceError
			// inside the page, which reads as a parity failure rather than a marshalling one.
			// eslint-disable-next-line no-new-func -- see above; the factory is closure-free by contract
			const createMigrations = new Function(
				`"use strict"; return (${factorySource});`,
			)() as typeof createParityMigrations;
			const report = runMounted(
				getHarnessSession().editor,
				createMigrations(),
			);
			return {
				applied: [...report.applied],
				skipped: [...report.skipped],
				failed: report.failed.map((entry) => ({
					id: entry.id,
					error:
						entry.error instanceof Error
							? entry.error.message
							: String(entry.error),
				})),
			};
		},
		{
			coreHref: CORE_HREF,
			sessionHref: SESSION_HREF,
			factorySource: createParityMigrations.toString(),
		},
	);
}

function reportSummary(report: MigrationReport): string {
	const failed = report.failed.map((entry) => {
		const message =
			entry.error instanceof Error ? entry.error.message : String(entry.error);
		return `${entry.id}: ${message}`;
	});
	return JSON.stringify({
		applied: report.applied,
		skipped: report.skipped,
		failed,
	});
}

scenario(
	"DUR4: runMigrations produces the same document headlessly and under a real DOM",
	async (s, page) => {
		const expectedFields = [
			"block.id",
			"block.type",
			"block.props",
			"block.content",
			"block.marks",
			"block.children",
			"block.table",
			"apps",
			"metadata",
		] as const;
		const fieldsMatch =
			ASSERT_DOC_EQUALS_FIELDS.length === expectedFields.length &&
			expectedFields.every(
				(field, index) => ASSERT_DOC_EQUALS_FIELDS[index] === field,
			);
		expect(
			ASSERT_DOC_EQUALS_FIELDS,
			formatCheckReport(
				"DUR7: assertDocEquals closed field list",
				fieldsMatch ? "passed" : "failed",
				fieldsMatch
					? undefined
					: `got ${JSON.stringify(ASSERT_DOC_EQUALS_FIELDS)}`,
			),
		).toEqual(expectedFields);

		await s.load("hello-world");
		await importMountedSession(page);

		const browserProbe = await page.evaluate(() => ({
			hasDocument: typeof document !== "undefined",
			hasFieldEditor: window.__penConformance.hasFieldEditor,
		}));
		expectCheck(
			"DUR4: browser side is a mounted field editor",
			browserProbe.hasDocument && browserProbe.hasFieldEditor,
			browserProbe.hasFieldEditor
				? undefined
				: "mounted editor has no field editor; comparison would not be a DOM path",
		);
		expectCheck(
			"DUR4: headless side is Node without a DOM document",
			typeof document === "undefined",
		);

		const seed = await disconnectAndEncodeMounted(page);
		const headless = editorFromEncodedState(seed);
		const headlessReport = runMigrations(headless, createParityMigrations());
		const browserReport = await runMigrationsOnMounted(page);

		expectCheck(
			"DUR4: headless runMigrations applied every id",
			headlessReport.failed.length === 0 &&
				headlessReport.applied.join() === EXPECTED_APPLIED.join(),
			reportSummary(headlessReport),
		);
		expectCheck(
			"DUR4: mounted runMigrations applied every id",
			browserReport.failed.length === 0 &&
				browserReport.applied.join() === EXPECTED_APPLIED.join(),
			reportSummary(browserReport),
		);

		const afterBrowser = await disconnectAndEncodeMounted(page);
		const browserResult = editorFromEncodedState(afterBrowser);

		let parityDetail: string | undefined;
		try {
			assertDocEquals(
				{ document: headless.internals.doc },
				{ document: browserResult.internals.doc },
			);
		} catch (error) {
			parityDetail =
				error instanceof Error ? error.message : String(error);
		}
		expectCheck(
			"DUR4: headless/browser runMigrations document parity",
			parityDetail === undefined,
			parityDetail,
		);

		await headless.destroy();
		await browserResult.destroy();
	},
	{ axe: false },
);
