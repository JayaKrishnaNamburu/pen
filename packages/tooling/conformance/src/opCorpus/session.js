import * as Y from "yjs";
import { createHeadlessEditor, getCommandRegistry } from "@input/pen-core";
import { wrapYjsDocument, yjsAdapter } from "@input/pen-crdt-yjs";
import { defaultSchema } from "@input/pen-schema-default";

import {
	APPLY_ID_BASE,
	FIXED_CLIENT_ID,
	FIXED_GUID,
	installDeterministicIds,
} from "./determinism.js";
import { snapshotDocument } from "./snapshot.js";

export function createCorpusSession() {
	const ids = installDeterministicIds();
	ids.reset();
	const ydoc = new Y.Doc({ gc: false, guid: FIXED_GUID });
	ydoc.clientID = FIXED_CLIENT_ID;
	const adapter = yjsAdapter();
	const crdtDoc = wrapYjsDocument(adapter, ydoc);
	const editor = createHeadlessEditor({
		schema: defaultSchema,
		crdt: adapter,
		document: crdtDoc,
	});
	if (ydoc.clientID !== FIXED_CLIENT_ID) {
		throw new Error(
			`op-equality session lost clientID: ${ydoc.clientID} !== ${FIXED_CLIENT_ID}`,
		);
	}
	return { editor, ydoc, ids, adapter };
}

export function destroyCorpusSession(session) {
	session.editor.destroy();
	session.ydoc.destroy();
	session.ids.restore();
}

function setupOps(spec) {
	const ops = [];
	for (const id of spec.clearBlockIds ?? []) {
		ops.push({ type: "delete-block", blockId: id });
	}
	for (const block of spec.blocks ?? []) {
		ops.push({
			type: "insert-block",
			blockId: block.id,
			blockType: block.type,
			props: block.props ?? {},
			position: block.parent
				? { parent: block.parent, index: block.index ?? 0 }
				: "last",
		});
		if (block.text) {
			ops.push({
				type: "insert-text",
				blockId: block.id,
				offset: 0,
				text: block.text,
			});
		}
		if (block.mention) {
			ops.push({
				type: "insert-inline-node",
				blockId: block.id,
				offset: block.mention.offset,
				nodeType: "mention",
				props: block.mention.props,
			});
		}
	}
	for (const op of spec.extraOps ?? []) {
		ops.push(op);
	}
	return ops;
}

export function applySetup(session, spec) {
	const existing = [...session.editor.documentState.blockOrder];
	const ops = setupOps({ ...spec, clearBlockIds: existing });
	if (ops.length > 0) {
		session.editor.apply(ops, { origin: "user" });
	}
	if (spec.selection) {
		session.editor.selectText(
			spec.selection.blockId,
			spec.selection.from,
			spec.selection.to,
		);
	}
}

export function captureApply(session, fn) {
	const captured = [];
	const originalApply = session.editor.apply.bind(session.editor);
	let first = true;
	session.editor.apply = (ops, options) => {
		if (first) {
			session.ids.setCounter(APPLY_ID_BASE);
			first = false;
		}
		captured.push(...ops);
		originalApply(ops, options);
	};
	const before = Y.encodeStateVector(session.ydoc);
	try {
		fn();
	} finally {
		session.editor.apply = originalApply;
	}
	const update = Y.encodeStateAsUpdate(session.ydoc, before);
	return { ops: captured, update };
}

export function dispatchCommand(session, command, param) {
	const registry = getCommandRegistry(session.editor);
	if (!registry) {
		throw new Error("op-equality session has no command registry");
	}
	const handled = registry.dispatch(command, param);
	if (handled !== true) {
		throw new Error(
			`op-equality command missed: ${command.name ?? command}`,
		);
	}
}

export function snapshotSession(session) {
	return snapshotDocument(session.editor, session.ydoc);
}
