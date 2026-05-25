import type {
	Awareness,
	CRDTDocument,
	CRDTEvent,
	DocumentScope,
	DocumentScopeInfo,
	DocumentScopeReplacementEvent,
	Unsubscribe,
} from "@pen/types";
import {
	SUBDOCUMENT,
	isYjsCRDTDocument,
	isYjsDoc,
	type YjsDoc,
} from "@pen/crdt-yjs";

export type ScopeListener = (event: CRDTEvent) => void;
export type ScopeReplacementListener = (
	event: DocumentScopeReplacementEvent,
) => void;

export type ScopeReplacementTarget = {
	previousScope: DocumentScope;
	ownerPath: string[];
};

export type ScopeEntry = {
	scope: DocumentScope;
	awareness: Awareness | null;
	observerUnsub: Unsubscribe;
	subdocsHandler: ((event: {
		added: Set<YjsDoc>;
		loaded: Set<YjsDoc>;
		removed: Set<YjsDoc>;
	}) => void) | null;
};

export function getDocumentGuid(doc: YjsDoc): string {
	const guid = (doc as YjsDoc & { guid?: string }).guid;
	return typeof guid === "string" && guid.length > 0
		? guid
		: `doc-${doc.clientID}`;
}

export function toScopeId(doc: CRDTDocument): string {
	if (!isYjsCRDTDocument(doc)) {
		return `scope-${Math.random().toString(36).slice(2)}`;
	}
	return getDocumentGuid(doc.ydoc);
}

export function cloneScope(scope: DocumentScope): DocumentScope {
	return { ...scope };
}

export function toScopeInfo(scope: DocumentScope): DocumentScopeInfo {
	return {
		id: scope.id,
		guid: scope.guid,
		kind: scope.kind,
		parentId: scope.parentId,
		ownerBlockId: scope.ownerBlockId,
	};
}

export function collectReplacementTargets(
	rootScope: DocumentScope,
	entries: Iterable<ScopeEntry>,
): ScopeReplacementTarget[] {
	const allEntries = Array.from(entries);
	const targets: ScopeReplacementTarget[] = [];
	const walk = (currentScope: DocumentScope, ownerPath: string[]) => {
		targets.push({
			previousScope: cloneScope(currentScope),
			ownerPath: [...ownerPath],
		});

		const childScopes = allEntries
			.filter((entry) => entry.scope.parentId === currentScope.id)
			.map((entry) => cloneScope(entry.scope));

		for (const childScope of childScopes) {
			if (childScope.ownerBlockId == null) {
				walk(childScope, ownerPath);
				continue;
			}
			walk(childScope, [...ownerPath, childScope.ownerBlockId]);
		}
	};

	walk(cloneScope(rootScope), []);
	return targets;
}

export function resolveReplacementScope(
	initialScope: DocumentScope,
	ownerPath: readonly string[],
	getChildScope: (
		ownerBlockId: string,
		currentScopeId: string,
	) => DocumentScope | null,
): DocumentScope {
	let resolvedScope = cloneScope(initialScope);
	for (const ownerBlockId of ownerPath) {
		const childScope = getChildScope(ownerBlockId, resolvedScope.id);
		if (!childScope) {
			break;
		}
		resolvedScope = childScope;
	}
	return resolvedScope;
}

export function emitScopeEvent(
	scope: DocumentScope,
	event: CRDTEvent,
	listenersByScope: Map<string, Set<ScopeListener>>,
	allListeners: Set<ScopeListener>,
): void {
	const scopedEvent: CRDTEvent = {
		...event,
		scope: toScopeInfo(scope),
	};

	const scopeListeners = listenersByScope.get(scope.id);
	if (scopeListeners) {
		for (const listener of scopeListeners) {
			listener(scopedEvent);
		}
	}

	for (const listener of allListeners) {
		listener(scopedEvent);
	}
}

export function findExistingScopeId(
	doc: CRDTDocument,
	entries: Iterable<[string, ScopeEntry]>,
): string | null {
	for (const [scopeId, entry] of entries) {
		if (entry.scope.doc === doc) {
			return scopeId;
		}
		if (
			isYjsCRDTDocument(entry.scope.doc) &&
			isYjsCRDTDocument(doc) &&
			entry.scope.doc.ydoc === doc.ydoc
		) {
			return scopeId;
		}
	}
	return null;
}

export function findRegisteredScopeForBlock(
	parentDoc: CRDTDocument,
	blockId: string,
	getScopeByGuid: (guid: string) => DocumentScope | null,
): DocumentScope | null {
	if (!isYjsCRDTDocument(parentDoc)) {
		return null;
	}
	const subdoc = parentDoc.penDocument.blocks.get(blockId)?.get(SUBDOCUMENT);
	if (!isYjsDoc(subdoc)) {
		return null;
	}
	return getScopeByGuid(getDocumentGuid(subdoc));
}

export function indexOwnerScope(
	scopeIdsByOwnerKey: Map<string, string>,
	scope: DocumentScope,
): void {
	if (!scope.parentId || !scope.ownerBlockId) {
		return;
	}
	scopeIdsByOwnerKey.set(toOwnerKey(scope.parentId, scope.ownerBlockId), scope.id);
}

export function removeOwnerIndex(
	scopeIdsByOwnerKey: Map<string, string>,
	scope: DocumentScope,
): void {
	if (!scope.parentId || !scope.ownerBlockId) {
		return;
	}
	scopeIdsByOwnerKey.delete(toOwnerKey(scope.parentId, scope.ownerBlockId));
}

export function toOwnerKey(scopeId: string, blockId: string): string {
	return `${scopeId}:${blockId}`;
}
