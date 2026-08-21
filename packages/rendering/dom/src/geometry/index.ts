export {
	createGeometryReader,
	verticalCaretTarget,
	type GeometryMeasureAdapter,
	type GeometryReaderHost,
	type GeometryReaderOptions,
	type GeometryReaderWithBlocks,
	type VerticalCaretTarget,
	type VerticalDirection,
} from "./geometryReader";
export { getRootGeometry, measureWithRoot } from "./rootGeometry";
export type { RootGeometry } from "./rootGeometry";
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
	getDistanceToRect,
	rectCenterX,
	rectCenterY,
	rectFromDOMRect,
	rectToDOMRect,
	singleRunLineBox,
} from "./types";
