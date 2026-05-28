import type { EditContextTextFormat } from "./editContextDom";

export type EditContextTextUpdateEvent = Event & {
	updateRangeStart: number;
	updateRangeEnd: number;
	text: string;
	selectionStart?: number;
	selectionEnd?: number;
};

export type EditContextTextFormatUpdateEvent = Event & {
	getTextFormats?(): EditContextTextFormat[];
};

export type EditContextCharacterBoundsUpdateEvent = Event & {
	rangeStart: number;
	rangeEnd: number;
};

export interface EditContext {
	updateText(start: number, end: number, text: string): void;
	updateSelection(start: number, end: number): void;
	updateCharacterBounds(start: number, rects: DOMRect[]): void;
	addEventListener(type: string, handler: (event: Event) => void): void;
	removeEventListener(type: string, handler: (event: Event) => void): void;
	readonly text: string;
	readonly selectionStart: number;
	readonly selectionEnd: number;
}

export type EditContextConstructor = new (options?: {
	text?: string;
	selectionStart?: number;
	selectionEnd?: number;
}) => EditContext;

export type EditContextGlobal = typeof globalThis & {
	EditContext?: EditContextConstructor;
};
