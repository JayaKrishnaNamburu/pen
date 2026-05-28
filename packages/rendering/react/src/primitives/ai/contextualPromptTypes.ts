export type ContextualPromptMode = "floating" | "inserted";
export type ContextualPromptSide = "top" | "bottom";

export interface ContextualPromptPlacement {
	anchorBlockId?: string;
	anchorRect: {
		top: number;
		left: number;
		width: number;
		height: number;
	};
	left: number;
	top: number;
	side: ContextualPromptSide;
}

export interface UseContextualPromptPlacementOptions {
	sessionId?: string;
	mode?: ContextualPromptMode;
	side?: ContextualPromptSide;
	sideOffset?: number;
	layoutRevision?: number;
	surfaceRef?: import("react").RefObject<HTMLElement | null>;
	containerRef?: import("react").RefObject<HTMLElement | null>;
}
