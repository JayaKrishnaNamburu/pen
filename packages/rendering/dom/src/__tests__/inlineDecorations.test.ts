import { describe, expect, it } from "vitest";
import { DECORATION_OMIT_FROM_RENDER_ATTRIBUTE } from "@input/pen-types";
import type { InlineDecoration } from "@input/pen-types";
import {
	applyInlineDecorationsToDeltas,
	areInlineDecorationsRenderEqual,
	areRenderedTextDeltasEqual,
	buildInlineDecorationsRenderSignature,
	filterVisibleInlineDecorationDeltas,
	inlineDecorationsRequireFullReconcile,
	retainRenderedTextDeltas,
} from "../utils/inlineDecorations";

describe("inline decorations", () => {
	it("renders virtual inline decoration text without keeping hidden source text", () => {
		const decorations = [
			{
				type: "inline",
				blockId: "body-1",
				from: 0,
				to: 5,
				omitFromRender: true,
				attributes: {},
			},
			{
				type: "inline",
				blockId: "body-1",
				from: 5,
				to: 5,
				virtualText: "Hi",
				virtualPlacement: "after",
				attributes: {
					"data-pen-ai-review-preview-virtual": true,
				},
			},
		] as InlineDecoration[];
		const deltas = applyInlineDecorationsToDeltas(
			[{ insert: "Hello world" }],
			decorations,
		);

		expect(filterVisibleInlineDecorationDeltas(deltas)).toEqual([
			{
				insert: "Hi",
				attributes: {
					__penInlineDecoration: {
						"data-pen-ai-review-preview-virtual": true,
						"data-pen-virtual-inline": true,
					},
				},
			},
			{ insert: " world" },
		]);
	});

	it("requires full reconcile when virtual or hidden inline decorations are present", () => {
		expect(
			inlineDecorationsRequireFullReconcile([
				{
					type: "inline",
					blockId: "body-1",
					from: 5,
					to: 5,
					virtualText: "Hi",
					virtualPlacement: "after",
					attributes: {},
				} as InlineDecoration,
			]),
		).toBe(true);
		expect(
			inlineDecorationsRequireFullReconcile([
				{
					type: "inline",
					blockId: "body-1",
					from: 0,
					to: 5,
					omitFromRender: true,
					attributes: {},
				} as InlineDecoration,
			]),
		).toBe(true);
		expect(
			inlineDecorationsRequireFullReconcile([
				{
					type: "inline",
					blockId: "body-1",
					from: 0,
					to: 2,
					attributes: { bold: true },
				} as InlineDecoration,
			]),
		).toBe(false);
	});

	it("includes omitFromRender in inline decoration render signatures", () => {
		const visibleDecoration = {
			type: "inline",
			blockId: "body-1",
			from: 0,
			to: 5,
			attributes: {},
		} as InlineDecoration;
		const hiddenDecoration = {
			...visibleDecoration,
			omitFromRender: true,
		} as InlineDecoration;
		const visible = [visibleDecoration];

		expect(
			areInlineDecorationsRenderEqual(visible, [hiddenDecoration]),
		).toBe(false);
		expect(
			buildInlineDecorationsRenderSignature([hiddenDecoration], visible),
		).not.toBe(visible);
	});

	it("SCALE2 I8: retains the previous decoration list when render fields are unchanged", () => {
		const decorations: InlineDecoration[] = [
			{
				type: "inline",
				blockId: "body-1",
				from: 0,
				to: 5,
				attributes: { bold: true },
			},
		];

		expect(buildInlineDecorationsRenderSignature(decorations)).toBe(
			decorations,
		);
		expect(
			buildInlineDecorationsRenderSignature(
				[
					{
						type: "inline",
						blockId: "body-1",
						from: 0,
						to: 5,
						attributes: { bold: true },
					},
				],
				decorations,
			),
		).toBe(decorations);
	});

	it("SCALE2: treats key-order and dropped undefined members as the same decoration", () => {
		const previous: InlineDecoration[] = [
			{
				type: "inline",
				blockId: "body-1",
				from: 0,
				to: 4,
				attributes: { bold: true, italic: true },
			},
		];
		const reordered: InlineDecoration[] = [
			{
				type: "inline",
				blockId: "body-1",
				from: 0,
				to: 4,
				attributes: { italic: true, bold: true },
			},
		];
		const withUndefinedMember = [
			{
				...reordered[0]!,
				attributes: {
					italic: true,
					bold: true,
					strike: undefined,
				},
			},
		] as unknown as InlineDecoration[];

		expect(
			JSON.stringify(previous[0]!.attributes) ===
				JSON.stringify(reordered[0]!.attributes),
		).toBe(false);
		expect(buildInlineDecorationsRenderSignature(reordered, previous)).toBe(
			previous,
		);
		expect(
			buildInlineDecorationsRenderSignature(
				withUndefinedMember,
				previous,
			),
		).toBe(previous);
	});

	it("SCALE2 I8: retains the previous rendered deltas when insert and attributes match", () => {
		const previous = [
			{
				insert: "Hi",
				attributes: { bold: true },
			},
		];
		const next = [
			{
				insert: "Hi",
				attributes: { bold: true, italic: undefined },
			},
		];
		const reordered = [
			{
				insert: { type: "mention", label: "Ada", id: "1" },
			},
		];
		const reorderedPrevious = [
			{
				insert: { type: "mention", id: "1", label: "Ada" },
			},
		];

		expect(retainRenderedTextDeltas(previous, next)).toBe(previous);
		expect(areRenderedTextDeltasEqual(previous, next)).toBe(true);
		expect(
			JSON.stringify(reorderedPrevious[0]!.insert) ===
				JSON.stringify(reordered[0]!.insert),
		).toBe(false);
		expect(retainRenderedTextDeltas(reorderedPrevious, reordered)).toBe(
			reorderedPrevious,
		);
	});
});
