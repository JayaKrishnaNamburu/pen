import type { A11yMessageKey } from "./a11yMessages";

type NoMessageParams = Record<never, never>;

type A11yMessageParams = {
	blockConverted: { blockType: string };
	undoApplied: { hint: string };
	redoApplied: { hint: string };
	blockSelectionEntered: { count: number };
	blockSelectionChanged: { count: number };
	cellSelectionChanged: { rows: number; columns: number };
	suggestionAppeared: NoMessageParams;
	suggestionAccepted: NoMessageParams;
	suggestionRejected: NoMessageParams;
	streamingStarted: NoMessageParams;
	streamingFinished: NoMessageParams;
	findMatches: { count: number };
	atomSelected: { atomType: string };
	collaboratorJoined: { name: string };
	collaboratorEditing: { name: string };
};

export type PluralMessage = {
	readonly other: string;
} & Partial<Record<Exclude<Intl.LDMLPluralRule, "other">, string>>;

export type MessageValue = string | PluralMessage;

export type MessageParamsByKey = {
	[K in A11yMessageKey as `pen.a11y.${K}`]: A11yMessageParams[K];
} & {
	"pen.selection.blocksSelected": { count: number };
	"pen.ai.review.accept": NoMessageParams;
	"pen.schema.paragraph.title": NoMessageParams;
	"pen.schema.paragraph.description": NoMessageParams;
	"pen.schema.paragraph.placeholder": NoMessageParams;
	"pen.schema.heading.title": NoMessageParams;
	"pen.schema.heading.placeholder": NoMessageParams;
	"pen.display.group.basic": NoMessageParams;
	"pen.display.group.lists": NoMessageParams;
};

export type MessageKey = keyof MessageParamsByKey;

export type MessageParams<K extends MessageKey> = MessageParamsByKey[K];

export type MessageCatalog = {
	[K in MessageKey]: MessageValue;
};

export type MessageArgs<K extends MessageKey> = [
	keyof MessageParamsByKey[K],
] extends [never]
	? [params?: MessageParamsByKey[K]]
	: [params: MessageParamsByKey[K]];

export const DEFAULT_MESSAGE_CATALOG: MessageCatalog = {
	"pen.a11y.blockConverted": "Converted to {blockType}",
	"pen.a11y.undoApplied": "Undid {hint}",
	"pen.a11y.redoApplied": "Redid {hint}",
	"pen.a11y.blockSelectionEntered": "{count} blocks selected",
	"pen.a11y.blockSelectionChanged": "{count} blocks selected",
	"pen.a11y.cellSelectionChanged": "{rows} by {columns} cells selected",
	"pen.a11y.suggestionAppeared": "Suggestion appeared",
	"pen.a11y.suggestionAccepted": "Suggestion accepted",
	"pen.a11y.suggestionRejected": "Suggestion rejected",
	"pen.a11y.streamingStarted": "Streaming started",
	"pen.a11y.streamingFinished": "Streaming finished",
	"pen.a11y.findMatches": "{count} matches",
	"pen.a11y.atomSelected": "{atomType} selected",
	"pen.a11y.collaboratorJoined": "{name} joined",
	"pen.a11y.collaboratorEditing": "{name} is editing",
	"pen.selection.blocksSelected": "{count} blocks selected",
	"pen.ai.review.accept": "Accept",
	"pen.schema.paragraph.title": "Paragraph",
	"pen.schema.paragraph.description": "Plain text paragraph",
	"pen.schema.paragraph.placeholder": "Text",
	"pen.schema.heading.title": "Heading",
	"pen.schema.heading.placeholder": "Heading",
	"pen.display.group.basic": "Basic",
	"pen.display.group.lists": "Lists",
};

export function isPluralMessage(value: unknown): value is PluralMessage {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { other?: unknown }).other === "string"
	);
}

export function interpolateMessage(
	template: string,
	params?: Record<string, unknown>,
): string {
	if (!params) {
		return template;
	}
	return template.replace(
		/\{([a-zA-Z][a-zA-Z0-9]*)\}/g,
		(match, name: string) => {
			if (!(name in params)) {
				return match;
			}
			const value = params[name];
			return value == null ? "" : String(value);
		},
	);
}

export function resolveMessage<K extends MessageKey>(
	catalog: Partial<MessageCatalog>,
	key: K,
	...args: MessageArgs<K>
): string {
	const raw = catalog[key] ?? DEFAULT_MESSAGE_CATALOG[key];
	if (raw == null) {
		return "";
	}
	if (isPluralMessage(raw)) {
		return interpolateMessage(raw.other, args[0]);
	}
	return interpolateMessage(raw, args[0]);
}
