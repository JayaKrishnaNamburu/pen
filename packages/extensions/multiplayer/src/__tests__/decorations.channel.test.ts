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
import { defaultSchema } from "@input/pen-schema";
import { describe, expect, it } from "vitest";
import { getMultiplayerController, multiplayerExtension } from "../index";
import { MultiplayerControllerImpl } from "../controller";
import type { MultiplayerAwarenessState } from "../types";
import { wireCursor } from "./presenceAnchors";

type DecorationCall = {
	readonly state: DocumentState;
	readonly editor: Editor;
};

function countingProbe(): {
	calls: DecorationCall[];
	extension: Extension;
} {
	const calls: DecorationCall[] = [];
	return {
		calls,
		extension: defineExtension({
			name: "decoration-call-probe",
			facets: [
				decorationsFacet.of((state, editor) => {
					calls.push({ state, editor });
					return createDecorationSet([]);
				}),
			],
		}),
	};
}

function markerExtension(name: string, className: string): Extension {
	return defineExtension({
		name,
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
						attributes: { class: className },
					},
				]);
			}),
		],
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
				type: "splice-text";
				blockId: string;
				from: number;
				to: number;
				insert: string;
		  }
	> = [
		{
			type: "splice-text",
			blockId: firstBlockId,
			from: 0,
				to: 0,
				insert: "hello 0",
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
			type: "splice-text",
			blockId,
			from: 0,
				to: 0,
				insert: `hello ${index}`,
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
					cursor: wireCursor(editor, 2, 10, blockId),
				},
			],
		]),
	);
	editor.requestDecorationUpdate();
}

describe("multiplayer decorations channel", () => {
	it("declares decorations on decorationsFacet, not Extension.decorations", () => {
		const extension = multiplayerExtension({
			user: { id: "u1", name: "Ada" },
		});
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [extension],
		});

		expect("decorations" in extension).toBe(false);
		expect(
			editor.facet(decorationsFacet).some((source) => typeof source === "function"),
		).toBe(true);
		editor.destroy();
	});

	it("invokes decorationsFacet sources with (documentState, editor)", () => {
		const probe = countingProbe();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				multiplayerExtension({ user: { id: "u1", name: "Ada" } }),
				probe.extension,
			],
		});

		expect(probe.calls.length).toBeGreaterThan(0);
		const first = probe.calls[0];
		expect(first?.state).toBe(editor.documentState);
		expect(first?.editor).toBe(editor);
		editor.destroy();
	});

	it("invokes decorationsFacet sources once per commit, not once per block", () => {
		const probe = countingProbe();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				multiplayerExtension({ user: { id: "u1", name: "Ada" } }),
				probe.extension,
			],
		});
		const afterInit = probe.calls.length;
		const blockCount = 8;

		insertHelloBlocks(editor, blockCount);

		expect(probe.calls.length - afterInit).toBe(1);
		expect(probe.calls.length - afterInit).not.toBe(blockCount);
		editor.destroy();
	});

	it("merges decorations in extension registration order", () => {
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

	it("collects decorationsFacet sources into getDecorations()", () => {
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
		expect(classes).toContain("facet-only-probe");
		editor.destroy();
	});
});
