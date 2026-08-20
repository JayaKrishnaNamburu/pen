import type { CommitEvent, DiagnosticEvent, DocumentCommitEvent } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { createDefaultSchema } from "@input/pen-schema-default";
import {
	EVENT_DEPRECATED_CODE,
	createEditor as createCoreEditor,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

describe("commit event adapters (Wave 2.2)", () => {
	it("adapter snapshots: change and documentCommit match v1 shape for a local apply", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const changes: unknown[][] = [];
		const documentCommits: DocumentCommitEvent[] = [];
		const commits: CommitEvent[] = [];

		editor.on("diagnostic", () => {});
		editor.on("change", (events) => {
			changes.push(events);
		});
		editor.on("documentCommit", (event) => {
			documentCommits.push(event);
		});
		editor.on("commit", (event) => {
			commits.push(event);
		});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toHaveLength(1);
		expect(changes[0][0]).toMatchObject({
			origin: "user",
			affectedBlocks: [blockId],
			ops: [
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "hello",
				},
			],
		});

		expect(documentCommits).toHaveLength(1);
		expect(documentCommits[0]).toMatchObject({
			commitId: 2,
			origin: "user",
			affectedBlocks: [blockId],
			ops: [
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "hello",
				},
			],
		});
		expect(documentCommits[0].blockRevisions[blockId]).toBe(
			editor.getBlockRevision(blockId),
		);

		expect(commits).toHaveLength(1);
		expect(commits[0].commitId).toBe(2);
		expect(commits[0].origin).toEqual({ type: "user" });
		expect(commits[0].source).toBe("apply");
		expect(commits[0].diagnostics).toEqual([]);
		expect(commits[0].summary.text.map((text) => text.blockId)).toContain(
			blockId,
		);

		editor.destroy();
	});

	it("I1: one commit per local apply", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const commits: number[] = [];
		editor.on("commit", (event) => {
			commits.push(event.commitId);
		});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "a",
			},
		]);
		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 1,
				text: "b",
			},
		]);

		expect(commits).toEqual([2, 3]);

		editor.destroy();
	});

	it("emits event-deprecated once per adapter key per session when a listener exists", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];

		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.on("change", () => {});
		editor.on("documentCommit", () => {});

		const applyOnce = () =>
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "x",
				},
			]);

		applyOnce();
		applyOnce();

		const deprecated = diagnostics.filter(
			(event) => event.code === EVENT_DEPRECATED_CODE,
		);
		expect(deprecated.map((event) => event.key).sort()).toEqual([
			"change",
			"documentCommit",
		]);

		editor.destroy();
	});

	it("does not emit event-deprecated when no adapter listener is registered", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const diagnostics: DiagnosticEvent[] = [];
		editor.on("diagnostic", (event) => {
			diagnostics.push(event);
		});
		editor.on("commit", () => {});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "x",
			},
		]);

		expect(
			diagnostics.some((event) => event.code === EVENT_DEPRECATED_CODE),
		).toBe(false);

		editor.destroy();
	});
});
