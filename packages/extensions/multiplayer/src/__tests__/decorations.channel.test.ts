import {
	createDecorationSet,
	createEditor,
	decorationsFacet,
	defineExtension,
} from "@input/pen-core";
import { createTestDocument } from "@input/pen-test";
import type {
	Decoration,
	DocumentState,
	Editor,
	Extension,
	InlineDecoration,
} from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";
import { getMultiplayerController, multiplayerExtension } from "../index";
import { MultiplayerControllerImpl } from "../controller";
import type { MultiplayerAwarenessState } from "../types";

type DecorationCall = {
	readonly state: DocumentState;
	readonly editor: Editor;
};

function instrumentDecorations(extension: Extension): DecorationCall[] {
	const original = extension.decorations;
	if (!original) {
		throw new Error("expected the v1 decorations field");
	}
	const calls: DecorationCall[] = [];
	extension.decorations = (state, editor) => {
		calls.push({ state, editor });
		return original(state, editor);
	};
	return calls;
}

function markerExtension(name: string, className: string): Extension {
	return defineExtension({
		name,
		decorations: (_state, editor) => {
			const blockId = editor.firstBlock()?.id;
			if (!blockId) {
				return createDecorationSet([]);
			}
			return createDecorationSet([
				{
					type: "inline",
					blockId,
					from: 0,
					to: 1,
					attributes: { class: className },
				},
			]);
		},
	});
}

function inlineClasses(decorations: readonly Decoration[]): string[] {
	return decorations
		.filter(
			(decoration): decoration is InlineDecoration =>
				decoration.type === "inline",
		)
		.map((decoration) => String(decoration.attributes.class ?? ""));
}

function insertHelloBlocks(editor: Editor, count: number): void {
	const firstBlockId = editor.firstBlock()!.id;
	const ops: Array<
		| {
				type: "insert-block";
				blockId: string;
				blockType: "paragraph";
				props: Record<string, never>;
				position: { after: string };
		  }
		| {
				type: "insert-text";
				blockId: string;
				offset: number;
				text: string;
		  }
	> = [
		{
			type: "insert-text",
			blockId: firstBlockId,
			offset: 0,
			text: "hello 0",
		},
	];
	let previousId = firstBlockId;
	for (let index = 1; index < count; index += 1) {
		const blockId = `hello-${index}`;
		ops.push({
			type: "insert-block",
			blockId,
			blockType: "paragraph",
			props: {},
			position: { after: previousId },
		});
		ops.push({
			type: "insert-text",
			blockId,
			offset: 0,
			text: `hello ${index}`,
		});
		previousId = blockId;
	}
	editor.apply(ops, { origin: "user" });
}

function seedRemoteCursor(editor: Editor): void {
	const blockId = editor.firstBlock()!.id;
	const controller = getMultiplayerController(
		editor,
	) as MultiplayerControllerImpl;
	controller.handleAwarenessChange(
		new Map<number, MultiplayerAwarenessState>([
			[
				editor.clientId,
				{
					user: { id: "u1", name: "Ada" },
				},
			],
			[
				77,
				{
					user: { id: "u2", name: "Babbage", color: "#abc123" },
					cursor: { blockId, offset: 2, clock: 10 },
				},
			],
		]),
	);
	editor.requestDecorationUpdate();
}

describe("multiplayer decorations channel", () => {
	it("lifts the v1 decorations function onto decorationsFacet without wrapping it", () => {
		const extension = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [extension],
		});

		expect(extension.decorations).toBeTypeOf("function");
		expect(editor.facet(decorationsFacet)).toContain(extension.decorations);
		editor.destroy();
	});

	it("invokes the v1 decorations function with (documentState, editor)", () => {
		const extension = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const calls = instrumentDecorations(extension);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [extension],
		});

		expect(calls.length).toBeGreaterThan(0);
		const first = calls[0];
		expect(first?.state).toBe(editor.documentState);
		expect(first?.editor).toBe(editor);
		editor.destroy();
	});

	it("invokes multiplayer decorations once per commit, not once per block", () => {
		const extension = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const calls = instrumentDecorations(extension);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [extension],
		});
		const afterInit = calls.length;
		const blockCount = 8;

		insertHelloBlocks(editor, blockCount);

		expect(calls.length - afterInit).toBe(1);
		expect(calls.length - afterInit).not.toBe(blockCount);
		editor.destroy();
	});

	it("merges v1 decorations in extension registration order", () => {
		const { crdtDoc } = createTestDocument([
			{ id: "b1", type: "paragraph", content: "Hello" },
		]);
		const multiplayer = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const editor = createEditor({
			schema: defaultSchema,
			document: crdtDoc,
			extensions: [
				markerExtension("probe-before", "probe-before"),
				multiplayer,
				markerExtension("probe-after", "probe-after"),
			],
		});
		seedRemoteCursor(editor);

		const classes = inlineClasses(
			editor.getDecorations().forBlock(editor.firstBlock()!.id),
		);
		expect(classes[0]).toBe("probe-before");
		expect(classes).toContain("pen-multiplayer-cursor");
		expect(classes[classes.length - 1]).toBe("probe-after");
		editor.destroy();
	});

	it("does not collect a decorationsFacet-only sibling into getDecorations()", () => {
		const { crdtDoc } = createTestDocument([
			{ id: "b1", type: "paragraph", content: "Hello" },
		]);
		const multiplayer = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const facetOnly = defineExtension({
			name: "facet-only-probe",
			facets: [
				decorationsFacet.of((_state, editor) => {
					const blockId = editor.firstBlock()?.id;
					if (!blockId) {
						return createDecorationSet([]);
					}
					return createDecorationSet([
						{
							type: "inline",
							blockId,
							from: 0,
							to: 1,
							attributes: { class: "facet-only-probe" },
						},
					]);
				}),
			],
		});
		const editor = createEditor({
			schema: defaultSchema,
			document: crdtDoc,
			extensions: [multiplayer, facetOnly],
		});
		seedRemoteCursor(editor);

		const classes = inlineClasses(editor.getDecorations().decorations);
		expect(classes).toContain("pen-multiplayer-cursor");
		expect(classes).not.toContain("facet-only-probe");
		expect(editor.facet(decorationsFacet).length).toBeGreaterThan(1);
		editor.destroy();
	});

	it("places the v1-lifted provider before a native decorationsFacet.of() in the facet list", () => {
		const multiplayer = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const nativeSource = () => createDecorationSet([]);
		const native = defineExtension({
			name: "native-deco",
			facets: [decorationsFacet.of(nativeSource)],
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [native, multiplayer],
		});

		expect(editor.facet(decorationsFacet)[0]).toBe(multiplayer.decorations);
		expect(editor.facet(decorationsFacet)).toContain(nativeSource);
		editor.destroy();
	});
});
