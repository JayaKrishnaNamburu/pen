export { createOverlayLayer, applyPaintPlan, onPaintPlan } from "./overlayLayer";
export { flushOverlay } from "./flushOverlay";
export { readPaintPlan } from "./paintPlan";
export {
	OVERLAY_ITEM_ATTR,
	OVERLAY_LAYER_ATTR,
} from "../../../../../rendering/dom/src/utils/dataAttributes";
export type {
	OverlayAffinity,
	OverlayFlushScheduler,
	OverlayBlockSelection,
	OverlayFlushCommit,
	OverlayGeometryReader,
	OverlayLayer,
	OverlayLayerOptions,
	OverlayPoint,
	OverlayRect,
	OverlaySelectionRecord,
	OverlaySelectionState,
	OverlayTextSelection,
	PaintPlan,
	PaintPlanItem,
	PaintPlanItemKind,
} from "./types";
