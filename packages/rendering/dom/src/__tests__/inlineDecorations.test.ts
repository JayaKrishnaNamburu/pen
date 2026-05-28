import { describe, expect, it } from "vitest";
import { DECORATION_OMIT_FROM_RENDER_ATTRIBUTE } from "@pen/types";
import type { InlineDecoration } from "@pen/types";
import {
	applyInlineDecorationsToDeltas,
	buildInlineDecorationsRenderSignature,
	filterVisibleInlineDecorationDeltas,
	inlineDecorationsRequireFullReconcile,
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

		expect(
			buildInlineDecorationsRenderSignature([visibleDecoration]),
		).not.toBe(
			buildInlineDecorationsRenderSignature([hiddenDecoration]),
		);
	});
});
