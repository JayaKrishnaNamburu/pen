export {
	createGeometryReader,
	verticalCaretTarget,
	type GeometryMeasureAdapter,
	type GeometryReaderHost,
	type GeometryReaderOptions,
	type VerticalCaretTarget,
	type VerticalDirection,
} from "./geometryReader";
export {
	getRootGeometry,
	measureWithRoot,
} from "./rootGeometry";
export type { RootGeometry } from "./rootGeometry";
export { registerVerticalCaretMeasure } from "./verticalCaretMeasure";
export type {
	Affinity,
	BidiRun,
	BidiRunGeometry,
	GeometryReader,
	LineBox,
	Point,
	Rect,
} from "./types";
export {
	collapsedRect,
	singleRunLineBox,
} from "./types";
