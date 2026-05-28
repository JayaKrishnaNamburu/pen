import type { InlineDecoration } from "@pen/types";
import { DECORATION_OMIT_FROM_RENDER_ATTRIBUTE } from "@pen/types";

const INLINE_DECORATION_ATTRIBUTE_KEY = "__penInlineDecoration";
const VIRTUAL_INLINE_DECORATION_ATTRIBUTE = "data-pen-virtual-inline";

interface TextDelta {
	insert: string | Record<string, unknown>;
	attributes?: Readonly<Record<string, unknown>>;
}

type VirtualInlineDecoration = InlineDecoration & {
	virtualText?: string;
	virtualPlacement?: "before" | "after";
};

export function applyInlineDecorationsToDeltas(
	deltas: readonly TextDelta[],
	decorations: readonly InlineDecoration[],
): TextDelta[] {
	if (decorations.length === 0) {
		return [...deltas];
	}

	const normalizedDecorations = decorations
		.filter((decoration) => decoration.to > decoration.from)
		.sort((left, right) =>
			left.from === right.from
				? left.to - right.to
				: left.from - right.from,
		);
	const virtualDecorations = decorations
		.flatMap((decoration) => {
			const virtualDecoration = decoration as VirtualInlineDecoration;
			const text = virtualDecoration.virtualText;
			if (!text) {
				return [];
			}
			return [{
				decoration,
				offset:
					virtualDecoration.virtualPlacement === "before"
						? virtualDecoration.from
						: virtualDecoration.to,
				text,
			}];
		})
		.sort((left, right) => left.offset - right.offset);
	if (normalizedDecorations.length === 0 && virtualDecorations.length === 0) {
		return [...deltas];
	}

	const result: TextDelta[] = [];
	let offset = 0;
	let virtualIndex = 0;

	const appendVirtualDecorationsAt = (targetOffset: number) => {
		while (
			virtualIndex < virtualDecorations.length &&
			virtualDecorations[virtualIndex]!.offset === targetOffset
		) {
			const { decoration, text } = virtualDecorations[virtualIndex]!;
			appendDelta(result, {
				insert: text,
				attributes: mergeDeltaAttributes(undefined, {
					...decoration.attributes,
					[VIRTUAL_INLINE_DECORATION_ATTRIBUTE]: true,
				}),
			});
			virtualIndex += 1;
		}
	};

	for (const delta of deltas) {
		appendVirtualDecorationsAt(offset);

		if (typeof delta.insert !== "string") {
			result.push({ ...delta });
			offset += 1;
			appendVirtualDecorationsAt(offset);
			continue;
		}

		const text = delta.insert;
		const textLength = text.length;
		if (textLength === 0) {
			continue;
		}

		const segmentStart = offset;
		const segmentEnd = offset + textLength;
		const boundaries = new Set<number>([segmentStart, segmentEnd]);

		for (const decoration of normalizedDecorations) {
			if (
				decoration.to <= segmentStart ||
				decoration.from >= segmentEnd
			) {
				continue;
			}
			boundaries.add(Math.max(decoration.from, segmentStart));
			boundaries.add(Math.min(decoration.to, segmentEnd));
		}
		for (const { offset: virtualOffset } of virtualDecorations) {
			if (virtualOffset >= segmentStart && virtualOffset <= segmentEnd) {
				boundaries.add(virtualOffset);
			}
		}

		const sortedBoundaries = [...boundaries].sort(
			(left, right) => left - right,
		);
		for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
			const from = sortedBoundaries[index];
			const to = sortedBoundaries[index + 1];
			appendVirtualDecorationsAt(from);
			if (to <= from) {
				continue;
			}

			const slice = text.slice(from - segmentStart, to - segmentStart);
			if (!slice) {
				continue;
			}

			const decorationAttributes = mergeDecorationAttributes(
				normalizedDecorations,
				from,
				to,
			);
			const attributes = mergeDeltaAttributes(
				delta.attributes,
				decorationAttributes,
			);
			appendDelta(result, {
				insert: slice,
				...(attributes ? { attributes } : {}),
			});
		}
		appendVirtualDecorationsAt(segmentEnd);

		offset = segmentEnd;
	}
	while (virtualIndex < virtualDecorations.length) {
		const { decoration, text } = virtualDecorations[virtualIndex]!;
		appendDelta(result, {
			insert: text,
			attributes: mergeDeltaAttributes(undefined, {
				...decoration.attributes,
				[VIRTUAL_INLINE_DECORATION_ATTRIBUTE]: true,
			}),
		});
		virtualIndex += 1;
	}

	return result;
}

export function filterVisibleInlineDecorationDeltas(
	deltas: readonly TextDelta[],
): TextDelta[] {
	let filteredDeltas: TextDelta[] | null = null;

	for (let index = 0; index < deltas.length; index += 1) {
		const delta = deltas[index]!;
		const decorationAttributes =
			delta.attributes?.[INLINE_DECORATION_ATTRIBUTE_KEY];
		if (!decorationAttributes || typeof decorationAttributes !== "object") {
			filteredDeltas?.push(delta);
			continue;
		}
		const isHidden =
			(decorationAttributes as Record<string, unknown>)[
				DECORATION_OMIT_FROM_RENDER_ATTRIBUTE
			] === true;
		if (!isHidden) {
			filteredDeltas?.push(delta);
			continue;
		}
		filteredDeltas = filteredDeltas ?? deltas.slice(0, index);
	}

	return filteredDeltas ?? (deltas as TextDelta[]);
}

export function inlineDecorationsRequireFullReconcile(
	decorations: readonly InlineDecoration[],
): boolean {
	return decorations.some((decoration) => {
		if ("virtualText" in decoration && decoration.virtualText) {
			return true;
		}
		if (decoration.omitFromRender === true) {
			return true;
		}
		const attributes = decoration.attributes;
		if (
			attributes &&
			attributes[DECORATION_OMIT_FROM_RENDER_ATTRIBUTE] === true
		) {
			return true;
		}
		return false;
	});
}

export function serializeInlineDecorationForRender(
	decoration: InlineDecoration,
): unknown[] {
	return [
		decoration.blockId,
		decoration.from,
		decoration.to,
		decoration.key ?? null,
		decoration.omitFromRender ?? null,
		"virtualText" in decoration ? decoration.virtualText : null,
		"virtualPlacement" in decoration ? decoration.virtualPlacement : null,
		decoration.attributes,
	];
}

export function buildInlineDecorationsRenderSignature(
	decorations: readonly InlineDecoration[],
): string {
	return JSON.stringify(
		decorations.map(serializeInlineDecorationForRender),
	);
}

export { INLINE_DECORATION_ATTRIBUTE_KEY, VIRTUAL_INLINE_DECORATION_ATTRIBUTE };

function mergeDecorationAttributes(
	decorations: readonly InlineDecoration[],
	from: number,
	to: number,
): Record<string, unknown> | null {
	let mergedAttributes: Record<string, unknown> | null = null;

	for (const decoration of decorations) {
		if (decoration.from > from || decoration.to < to) {
			continue;
		}
		mergedAttributes = {
			...(mergedAttributes ?? {}),
			...decoration.attributes,
			...(decoration.omitFromRender
				? { [DECORATION_OMIT_FROM_RENDER_ATTRIBUTE]: true }
				: {}),
		};
	}

	return mergedAttributes;
}

function mergeDeltaAttributes(
	baseAttributes: Readonly<Record<string, unknown>> | undefined,
	decorationAttributes: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
	if (!baseAttributes && !decorationAttributes) {
		return undefined;
	}
	if (!decorationAttributes) {
		return { ...baseAttributes };
	}

	return {
		...(baseAttributes ?? {}),
		[INLINE_DECORATION_ATTRIBUTE_KEY]: decorationAttributes,
	};
}

function appendDelta(target: TextDelta[], nextDelta: TextDelta): void {
	const previousDelta = target[target.length - 1];
	if (
		previousDelta &&
		typeof previousDelta.insert === "string" &&
		typeof nextDelta.insert === "string" &&
		attributesEqual(previousDelta.attributes, nextDelta.attributes)
	) {
		previousDelta.insert += nextDelta.insert;
		return;
	}
	target.push(nextDelta);
}

function attributesEqual(
	left: Readonly<Record<string, unknown>> | undefined,
	right: Readonly<Record<string, unknown>> | undefined,
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return left === right;
	}

	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		if (left[key] !== right[key]) {
			return false;
		}
	}

	return true;
}
