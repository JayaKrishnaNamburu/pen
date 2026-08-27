export interface BeforeInputCommandMapping {
	readonly commandName: string;
	readonly preventDefault: true;
	readonly param?: Readonly<Record<string, unknown>>;
}

export type BeforeInputAllowPolicy = {
	readonly policy: "allow";
};

export type BeforeInputBlockPolicy = {
	readonly policy: "block";
	readonly code: "unhandled-input-type";
};

export type BeforeInputMapping =
	| BeforeInputCommandMapping
	| BeforeInputAllowPolicy
	| BeforeInputBlockPolicy;

const ALLOW: BeforeInputAllowPolicy = { policy: "allow" };

const UNHANDLED: BeforeInputBlockPolicy = {
	policy: "block",
	code: "unhandled-input-type",
};

export const COMPOSITION_INPUT_TYPES = [
	"insertCompositionText",
	"insertFromComposition",
	"deleteByComposition",
	"deleteCompositionText",
] as const;

const INSERT_TEXT: BeforeInputCommandMapping = {
	commandName: "pen.insertText",
	preventDefault: true,
};

// policy table: command / allow IME / else block. command rows dispatch through the core registry; DIRECT_HANDLERS keep DOM-only fallbacks
export const BEFOREINPUT_MAP: Readonly<
	Record<string, BeforeInputCommandMapping | BeforeInputAllowPolicy>
> = {
	insertText: INSERT_TEXT,
	insertFromPaste: INSERT_TEXT,
	insertFromDrop: INSERT_TEXT,
	insertReplacementText: INSERT_TEXT,
	insertLineBreak: {
		commandName: "pen.insertLineBreak",
		preventDefault: true,
	},
	insertParagraph: {
		commandName: "pen.splitBlock",
		preventDefault: true,
	},
	deleteContentBackward: {
		commandName: "pen.deleteBackward",
		preventDefault: true,
		param: { granularity: "grapheme" },
	},
	deleteContentForward: {
		commandName: "pen.deleteForward",
		preventDefault: true,
		param: { granularity: "grapheme" },
	},
	deleteWordBackward: {
		commandName: "pen.deleteBackward",
		preventDefault: true,
		param: { granularity: "word" },
	},
	deleteWordForward: {
		commandName: "pen.deleteForward",
		preventDefault: true,
		param: { granularity: "word" },
	},
	deleteSoftLineBackward: {
		commandName: "pen.deleteBackward",
		preventDefault: true,
		param: { granularity: "line" },
	},
	deleteHardLineBackward: {
		commandName: "pen.deleteBackward",
		preventDefault: true,
		param: { granularity: "line" },
	},
	deleteSoftLineForward: {
		commandName: "pen.deleteForward",
		preventDefault: true,
		param: { granularity: "line" },
	},
	deleteHardLineForward: {
		commandName: "pen.deleteForward",
		preventDefault: true,
		param: { granularity: "line" },
	},
	formatBold: {
		commandName: "pen.toggleMark",
		preventDefault: true,
		param: { mark: "bold" },
	},
	formatItalic: {
		commandName: "pen.toggleMark",
		preventDefault: true,
		param: { mark: "italic" },
	},
	formatUnderline: {
		commandName: "pen.toggleMark",
		preventDefault: true,
		param: { mark: "underline" },
	},
	historyUndo: {
		commandName: "history.undo",
		preventDefault: true,
	},
	historyRedo: {
		commandName: "history.redo",
		preventDefault: true,
	},
	insertCompositionText: ALLOW,
	insertFromComposition: ALLOW,
	deleteByComposition: ALLOW,
	deleteCompositionText: ALLOW,
};

export function mapBeforeInput(inputType: string): BeforeInputMapping {
	return BEFOREINPUT_MAP[inputType] ?? UNHANDLED;
}

/**
 * Input types an attached EditContext delivers as `textupdate`, which is that
 * backend's sensor (B2). Calling `preventDefault` on their `beforeinput`
 * cancels the `textupdate` too and the keystroke is lost, so these rows stay
 * `allow` no matter what the shared table says.
 *
 * Chromium routes the rest straight at the DOM instead, so those keep the
 * shared policy: a command row is claimed, an unknown row is blocked.
 */
const EDIT_CONTEXT_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
	"insertText",
	"insertReplacementText",
	...COMPOSITION_INPUT_TYPES,
]);

export function mapEditContextBeforeInput(
	inputType: string,
): BeforeInputMapping {
	return EDIT_CONTEXT_TEXT_INPUT_TYPES.has(inputType)
		? ALLOW
		: mapBeforeInput(inputType);
}
