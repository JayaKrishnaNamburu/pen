import { createDecorationSet, emptyDecorationSet } from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import { defineExtension } from "@input/pen-core";
import type { Decoration, Extension } from "@input/pen-types";
import * as Y from "yjs";
import {
	SCALE3_DECORATION_COUNT_POINTS,
	SCALE3_EXTENSION_COUNT_POINTS,
	SCALE3_PEER_COUNT_POINTS,
	SCALE3_PLUS_EXTENSIONS,
} from "../constants/scale3";
import { createLargeDocument } from "./largeDoc";

export interface Scale3StackOptions {
	blockCount: number;
	extraDecoratingExtensions?: number;
	decorationCount?: number;
	peerCount?: number;
}

const seedUpdates = new Map<number, Uint8Array>();

function seedUpdate(blockCount: number): Uint8Array {
	const cached = seedUpdates.get(blockCount);
	if (cached) {
		return cached;
	}

	const { ydoc } = createLargeDocument(blockCount);
	const update = Y.encodeStateAsUpdate(ydoc);
	seedUpdates.set(blockCount, update);
	return update;
}

export function createScale3YDoc(blockCount: number): Y.Doc {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, seedUpdate(blockCount));
	return ydoc;
}

function makeNoopPlusExtension(
	name: string,
	decorations: readonly Decoration[],
): Extension {
	const set =
		decorations.length === 0
			? emptyDecorationSet()
			: createDecorationSet([...decorations]);

	return defineExtension({
		name,
		observe(_events, _editor) {
			// no-op: installed so dispatchObserve still walks the shipped list
		},
		decorations() {
			return set;
		},
	});
}

function inlineDecorations(count: number): Decoration[] {
	const decorations: Decoration[] = [];
	for (let i = 0; i < count; i++) {
		decorations.push({
			type: "inline",
			blockId: `block-${i}`,
			from: 0,
			to: 1,
			attributes: { "data-pen-scale3-decoration": true },
			key: `scale3-deco-${i}`,
		});
	}
	return decorations;
}

function peerDecorations(count: number): Decoration[] {
	const decorations: Decoration[] = [];
	for (let i = 0; i < count; i++) {
		decorations.push({
			type: "block",
			blockId: `block-${i}`,
			attributes: {
				"data-pen-remote-caret": true,
				peer: i,
			},
			position: "after",
		});
	}
	return decorations;
}

/**
 * Default preset (createEditor's built-in four) plus no-op stand-ins for
 * AI, suggestions, autocomplete, search, and multiplayer.
 *
 * Search decorations live on the search stand-in; remote-caret decorations
 * live on the multiplayer stand-in. Extra decorating extensions are the
 * SCALE2 "+8" axis, not part of the shipped stack.
 */
export function createScale3Extensions(
	options: Scale3StackOptions,
): Extension[] {
	const decorationCount = options.decorationCount ?? 0;
	const peerCount = options.peerCount ?? 0;
	const extraCount = options.extraDecoratingExtensions ?? 0;

	const plus = SCALE3_PLUS_EXTENSIONS.map((name) => {
		if (name === "search") {
			return makeNoopPlusExtension(name, inlineDecorations(decorationCount));
		}
		if (name === "multiplayer") {
			return makeNoopPlusExtension(name, peerDecorations(peerCount));
		}
		return makeNoopPlusExtension(name, []);
	});

	const extras = Array.from({ length: extraCount }, (_, i) =>
		makeNoopPlusExtension(`scale3-extra-${i}`, []),
	);

	return [...plus, ...extras];
}

export function createScale3Editor(options: Scale3StackOptions) {
	return createTestEditor({
		doc: createScale3YDoc(options.blockCount),
		extensions: createScale3Extensions(options),
	});
}

export function scale3KeystrokeTarget(blockCount: number): string {
	return `block-${Math.floor(blockCount / 2)}`;
}

export const SCALE3_SHARED_POINT = {
	blockCount: 1000,
	extraDecoratingExtensions: 0,
	decorationCount: SCALE3_DECORATION_COUNT_POINTS[0],
	peerCount: SCALE3_PEER_COUNT_POINTS[0],
	extensionCount: SCALE3_EXTENSION_COUNT_POINTS[0],
} as const;
