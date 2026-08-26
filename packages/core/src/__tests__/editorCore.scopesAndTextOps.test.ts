import { yjsAdapter } from "@input/pen-crdt-yjs";
import { type DocumentSession, type PenStreamPart } from "@input/pen-types";
import { defineExtension, getOpOriginType } from "@input/pen-core";
import { describe, expect, it, vi } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
import {
	createDecorationSet,
	createDocumentSession,
	applyMergeBlocks,
	applySplitBlock,
	createEditor as createCoreEditor,
	createHeadlessEditor,
	documentOpsToolRuntimeFacet,
	ensureInlineCompletionController,
	undoManagerFacet,
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

function createDefaultEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
	});
}

async function* createStream(parts: PenStreamPart[]) {
	for (const part of parts) {
		yield part;
	}
}

async function flushMicrotasks(count = 8): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestBlockMapLike = {
	get(key: string): unknown;
};

type TestBlocksMapLike = {
	get(key: string): TestBlockMapLike | undefined;
};

type TestRawDocLike = {
	getMap(name: "blocks"): TestBlocksMapLike;
};

type TestTableRowLike = {
	get(field: "cells"): { delete(index: number, length: number): void };
};

type TestTableContentLike = {
	get(index: number): TestTableRowLike;
};

describe("@input/pen-core createEditor: subdocument scopes and text operations", () => {
	it("discovers subdocument scopes and lets nested editors edit them", () => {
		const session = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const rootEditor = createEditor({
			documentSession: session,
		});

		rootEditor.apply([
			{
				type: "insert-block",
				blockId: "subdoc-block",
				blockType: "subdocument",
				props: { title: "Nested" },
				position: "last",
			},
		]);

		const childScope = session.getScopeForBlock("subdoc-block", {
			scopeId: rootEditor.documentScope.id,
		});
		expect(childScope).not.toBeNull();
		expect(rootEditor.getBlock("subdoc-block")?.props.subdocumentGuid).toBe(
			childScope?.guid,
		);

		const childEditor = createEditor({
			documentSession: session,
			documentScopeId: childScope!.id,
		});
		const childBlockId = childEditor.firstBlock()!.id;

		childEditor.apply([
			{
				type: "splice-text",
				blockId: childBlockId,
				from: 0,
				to: 0,
				insert: "Nested content",
			},
		]);

		expect(childEditor.getBlock(childBlockId)?.textContent()).toBe(
			"Nested content",
		);
		expect(childEditor.documentScope.parentId).toBe(
			rootEditor.documentScope.id,
		);
		expect(childEditor.documentScope.ownerBlockId).toBe("subdoc-block");

		childEditor.apply([
			{
				type: "insert-block",
				blockId: "subdoc-block",
				blockType: "subdocument",
				props: { title: "Nested Nested" },
				position: "last",
			},
		]);

		const nestedScope = session.getScopeForBlock("subdoc-block", {
			scopeId: childEditor.documentScope.id,
		});
		expect(nestedScope).not.toBeNull();
		expect(nestedScope?.id).not.toBe(childScope?.id);
		expect(session.getScopeForBlock("subdoc-block")).toBeNull();

		childEditor.destroy();
		rootEditor.destroy();
		session.destroy();
	});

	it("supports delegated document session implementations for scope replacement", async () => {
		const baseSession = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const delegatedSession: DocumentSession = {
			adapter: baseSession.adapter,
			get rootScope() {
				return baseSession.rootScope;
			},
			getScope: (scopeId) => baseSession.getScope(scopeId),
			getScopeByGuid: (guid) => baseSession.getScopeByGuid(guid),
			getScopeForBlock: (blockId, options) =>
				baseSession.getScopeForBlock(blockId, options),
			listScopes: () => baseSession.listScopes(),
			getAwareness: (scopeId) => baseSession.getAwareness(scopeId),
			observe: (scopeId, callback) =>
				baseSession.observe(scopeId, callback),
			observeAll: (callback) => baseSession.observeAll(callback),
			createSubdocument: (blockId, options) =>
				baseSession.createSubdocument(blockId, options),
			loadSubdocument: (scopeId) => baseSession.loadSubdocument(scopeId),
			replaceScopeDocument: (scopeId, doc, options) =>
				baseSession.replaceScopeDocument(scopeId, doc, options),
			attachEditor: (options) => baseSession.attachEditor(options),
			destroy: () => baseSession.destroy(),
		};
		const editor = createEditor({
			documentSession: delegatedSession,
		});
		const originalDoc = editor.internals.crdtDoc;
		const replacementSource = createEditor();
		const replacementDoc = delegatedSession.adapter.loadDocument(
			delegatedSession.adapter.encodeState(
				replacementSource.internals.crdtDoc,
			),
		);

		delegatedSession.replaceScopeDocument(
			editor.documentScope.id,
			replacementDoc,
		);
		await flushMicrotasks();

		expect(editor.internals.crdtDoc).toBe(replacementDoc);
		expect(editor.internals.crdtDoc).not.toBe(originalDoc);
		expect(editor.firstBlock()).not.toBeNull();

		replacementSource.destroy();
		editor.destroy();
		delegatedSession.destroy();
	});

	it("rebinds child-scope editors when the root session document is replaced", async () => {
		const session = createDocumentSession({
			adapter: yjsAdapter(),
		});
		const rootEditor = createEditor({
			documentSession: session,
		});
		rootEditor.apply([
			{
				type: "insert-block",
				blockId: "subdoc-block",
				blockType: "subdocument",
				props: { title: "Nested" },
				position: "last",
			},
		]);
		const childScope = session.getScopeForBlock("subdoc-block", {
			scopeId: rootEditor.documentScope.id,
		});
		const childEditor = createEditor({
			documentSession: session,
			documentScopeId: childScope!.id,
		});
		const childBlockId = childEditor.firstBlock()!.id;
		childEditor.apply([
			{
				type: "splice-text",
				blockId: childBlockId,
				from: 0,
				to: 0,
				insert: "Original nested content",
			},
		]);

		const replacementSession = createDocumentSession({
			adapter: yjsAdapter(),
			ownsDocuments: false,
		});
		const replacementRootEditor = createEditor({
			documentSession: replacementSession,
		});
		replacementRootEditor.apply([
			{
				type: "insert-block",
				blockId: "subdoc-block",
				blockType: "subdocument",
				props: { title: "Nested" },
				position: "last",
			},
		]);
		const replacementChildScope = replacementSession.getScopeForBlock(
			"subdoc-block",
			{
				scopeId: replacementRootEditor.documentScope.id,
			},
		);
		const replacementChildEditor = createEditor({
			documentSession: replacementSession,
			documentScopeId: replacementChildScope!.id,
		});
		const replacementChildBlockId = replacementChildEditor.firstBlock()!.id;
		replacementChildEditor.apply([
			{
				type: "splice-text",
				blockId: replacementChildBlockId,
				from: 0,
				to: 0,
				insert: "Replacement nested content",
			},
		]);

		session.replaceScopeDocument(
			rootEditor.documentScope.id,
			replacementSession.rootScope.doc,
		);
		await flushMicrotasks();

		expect(childEditor.firstBlock()?.textContent()).toBe(
			"Replacement nested content",
		);
		expect(childEditor.documentScope.ownerBlockId).toBe("subdoc-block");
		expect(childEditor.documentScope.parentId).toBe(
			rootEditor.documentScope.id,
		);

		replacementChildEditor.destroy();
		replacementRootEditor.destroy();
		replacementSession.destroy();
		childEditor.destroy();
		rootEditor.destroy();
		session.destroy();
	});

	it("creates a working editor with default schema and extensions", () => {
		const editor = createDefaultEditor();

		expect(editor.schema.resolve("paragraph")).toBeTruthy();
		expect(typeof editor.clientId).toBe("number");
		expect(editor.internals.engine).toBeTruthy();
		// bare core is not batteries-included: document-ops and undo both arrive
		// via @input/pen-preset-default. createEditor's fallback list is empty,
		// so core depends on no extension package at all (API1/F12).
		expect(editor.facet(documentOpsToolRuntimeFacet)).toBeNull();
		expect(editor.facet(undoManagerFacet)).toBeNull();

		editor.destroy();
	});

	it("starts with a single empty paragraph block in zero-config mode", () => {
		const editor = createDefaultEditor();

		expect(editor.blockCount()).toBe(1);
		expect(editor.firstBlock()?.type).toBe("paragraph");
		expect(editor.firstBlock()?.textContent()).toBe("");

		editor.destroy();
	});

	it("applies insert-block and splice-text operations", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "hello",
			},
		]);

		expect(editor.getBlock("b1")?.textContent()).toBe("hello");

		editor.destroy();
	});

	it("moves the text selection after accepting an inline completion", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;
		const { controller } = ensureInlineCompletionController(editor);

		editor.apply([
			{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" },
		]);
		editor.selectText(blockId, 5, 5);
		controller.showSuggestion({
			id: "suggestion-1",
			blockId,
			offset: 5,
			text: " world",
			type: "inline",
		});

		expect(controller.acceptSuggestion()).toBe(true);

		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello world");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 11 },
			focus: { blockId, offset: 11 },
		});

		editor.destroy();
	});

	it("splits and merges inline blocks", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "hello world",
			},
		]);

		applySplitBlock(editor, {
			blockId: "b1",
			offset: 5,
			newBlockId: "b2",
		});

		expect(editor.getBlock("b1")?.textContent()).toBe("hello");
		expect(editor.getBlock("b2")?.textContent()).toBe(" world");

		applyMergeBlocks(editor, {
			targetBlockId: "b1",
			sourceBlockId: "b2",
		});

		expect(editor.getBlock("b1")?.textContent()).toBe("hello world");
		expect(editor.getBlock("b2")).toBeNull();

		editor.destroy();
	});
});
