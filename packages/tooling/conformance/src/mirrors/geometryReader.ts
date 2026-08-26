/**
 * Structural mirror of `@input/pen-dom` `GeometryReader`.
 *
 * G3 evaluates `createGeometryReader` inside the page and cannot import
 * the production type there. This copy is the type the scenario names.
 * `scripts/conformance-mirror-drift.mjs` pins it against
 * `packages/rendering/dom/src/geometry/types.ts`.
 */

export type GeometryAffinity = "upstream" | "downstream";

export interface GeometryPoint {
	readonly blockId: string;
	readonly offset: number;
}

export interface GeometryRect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly top: number;
	readonly left: number;
	readonly right: number;
	readonly bottom: number;
}

export interface GeometryBidiRun {
	readonly from: number;
	readonly to: number;
	readonly level: number;
}

export interface GeometryBidiRunGeometry {
	readonly run: GeometryBidiRun;
	readonly rect: GeometryRect;
}

export interface GeometryLineBox {
	readonly top: number;
	readonly bottom: number;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly runs: readonly GeometryBidiRunGeometry[];
}

export interface GeometryReader {
	caretRect(point: GeometryPoint, affinity: GeometryAffinity): GeometryRect | null;
	rangeRects(range: { anchor: GeometryPoint; focus: GeometryPoint }): readonly GeometryRect[];
	lineBoxes(blockId: string): readonly GeometryLineBox[];
	pointAt(x: number, y: number): GeometryPoint | null;
	blockRect(blockId: string): GeometryRect | null;
	readonly generation: number;
}
