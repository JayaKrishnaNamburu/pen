import type { BlockHandle, Editor } from "@input/pen-types";

import { affectedBlockIdsFromSummary } from "../changes/affectedBlocks";
import {
	blockDirectionFacet,
	defaultDirectionFacet,
	type BlockDirectionResolver,
} from "../facets/directionFacets";
import { createDirectionCache, type DirectionCache } from "./cache";
import {
	type BlockDirection,
	type BlockDirectionSetting,
	resolveFirstStrong,
} from "./firstStrong";

type DirectionSession = {
	cache: DirectionCache;
	facetKey: string;
};

const sessions = new WeakMap<Editor, DirectionSession>();

function asDirectionSetting(
	value: unknown,
): BlockDirectionSetting | undefined {
	if (value === "ltr" || value === "rtl" || value === "auto") {
		return value;
	}
	return undefined;
}

export function resolveBlockDirection(
	editor: Editor,
	block: BlockHandle,
): BlockDirection {
	const session = sessionFor(editor);
	const facetKey = syncFacetKey(session, editor);
	const text = block.textContent();
	const cached = session.cache.get(block.id, text, block.props, facetKey);
	if (cached) {
		return cached;
	}
	const direction = computeBlockDirection(editor, block, text);
	session.cache.set(block.id, text, block.props, direction, facetKey);
	return direction;
}

function computeBlockDirection(
	editor: Editor,
	block: BlockHandle,
	text: string,
): BlockDirection {
	const setting = asDirectionSetting(block.props.direction);
	const base = readDefaultDirection(editor);
	switch (setting) {
		case "ltr":
		case "rtl":
			return setting;
		case "auto":
			return resolveFirstStrong(text, base);
		case undefined: {
			const fromFacet = firstFacetDirection(editor, block);
			if (fromFacet) {
				return fromFacet;
			}
			return resolveFirstStrong(text, base);
		}
		default: {
			const _exhaustive: never = setting;
			return _exhaustive;
		}
	}
}

function firstFacetDirection(
	editor: Editor,
	block: BlockHandle,
): BlockDirection | undefined {
	for (const resolver of readResolvers(editor)) {
		const result = readResolver(editor, resolver, block);
		if (result === "ltr" || result === "rtl") {
			return result;
		}
	}
	return undefined;
}

function readResolver(
	editor: Editor,
	resolver: BlockDirectionResolver,
	block: BlockHandle,
): BlockDirection | null | undefined {
	try {
		return resolver(block, editor);
	} catch (error) {
		if (editor.internals.hasListeners("diagnostic")) {
			editor.internals.emit("diagnostic", {
				code: "block-direction-resolver",
				level: "warn",
				source: "direction",
				message: "pen.blockDirection resolver threw",
				error,
			});
		}
		return undefined;
	}
}

function readDefaultDirection(editor: Editor): BlockDirection {
	const value = editor.facet(defaultDirectionFacet);
	return value === "rtl" ? "rtl" : "ltr";
}

function readResolvers(editor: Editor): readonly BlockDirectionResolver[] {
	const value = editor.facet(blockDirectionFacet);
	return Array.isArray(value) ? value : [];
}

function facetKey(editor: Editor): string {
	return `${readDefaultDirection(editor)}:${readResolvers(editor).length}`;
}

function sessionFor(editor: Editor): DirectionSession {
	const existing = sessions.get(editor);
	if (existing) {
		return existing;
	}
	const cache = createDirectionCache();
	editor.on("commit", (event) => {
		for (const blockId of affectedBlockIdsFromSummary(event.summary)) {
			cache.invalidate(blockId);
		}
	});
	const session: DirectionSession = {
		cache,
		facetKey: "",
	};
	sessions.set(editor, session);
	return session;
}

function syncFacetKey(session: DirectionSession, editor: Editor): string {
	const next = facetKey(editor);
	if (session.facetKey !== next) {
		session.facetKey = next;
		session.cache.clear();
	}
	return session.facetKey;
}
