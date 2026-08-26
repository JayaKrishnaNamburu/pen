export type DeleteGranularity = "grapheme" | "word" | "line";

export interface InsertTextParam {
	readonly text: string;
	readonly marks?: Record<string, unknown | null>;
}

export interface DeleteParam {
	readonly granularity: DeleteGranularity;
}

export interface ToggleMarkParam {
	readonly mark: string;
	readonly value?: unknown;
}

export interface ConvertBlockParam {
	readonly blockId: string;
	readonly newType: string;
	readonly newProps?: Record<string, unknown>;
}
