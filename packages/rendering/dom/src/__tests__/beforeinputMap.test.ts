import { describe, expect, it } from "vitest";
import {
	BEFOREINPUT_MAP,
	COMPOSITION_INPUT_TYPES,
	mapBeforeInput,
	type BeforeInputCommandMapping,
} from "../field-editor/beforeinputMap";
import { DIRECT_HANDLERS } from "../field-editor/contenteditableDirectHandlers";

const LISTED_COMMAND_ROWS: Readonly<Record<string, BeforeInputCommandMapping>> =
	{
		insertText: {
			commandName: "pen.insertText",
			preventDefault: true,
		},
		insertFromPaste: {
			commandName: "pen.insertText",
			preventDefault: true,
		},
		insertFromDrop: {
			commandName: "pen.insertText",
			preventDefault: true,
		},
		insertReplacementText: {
			commandName: "pen.insertText",
			preventDefault: true,
		},
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
	};

const SPEC_UNLISTED_TYPES = [
	"insertOrderedList",
	"formatFontName",
	"insertHorizontalRule",
	"formatStrikeThrough",
	"deleteByCut",
	"deleteSoftLineForward",
	"deleteHardLineForward",
	"insertFromPasteAsQuotation",
] as const;

describe("mapBeforeInput", () => {
	it("B1: maps every listed inputType to its spec policy", () => {
		for (const [inputType, expected] of Object.entries(
			LISTED_COMMAND_ROWS,
		)) {
			expect(mapBeforeInput(inputType)).toEqual(expected);
		}

		for (const inputType of COMPOSITION_INPUT_TYPES) {
			expect(mapBeforeInput(inputType)).toEqual({ policy: "allow" });
		}

		const listedTypes = [
			...Object.keys(LISTED_COMMAND_ROWS),
			...COMPOSITION_INPUT_TYPES,
		].sort();
		expect(Object.keys(BEFOREINPUT_MAP).sort()).toEqual(listedTypes);
		expect(Object.keys(BEFOREINPUT_MAP)).toHaveLength(21);
	});

	it("B1: every non-composition row ends in preventDefault", () => {
		for (const inputType of Object.keys(BEFOREINPUT_MAP)) {
			const mapping = mapBeforeInput(inputType);
			if ("policy" in mapping && mapping.policy === "allow") {
				continue;
			}
			expect(mapping).toMatchObject({ preventDefault: true });
		}
	});

	it("B1: composition rows allow IME to own the field", () => {
		expect(COMPOSITION_INPUT_TYPES).toEqual([
			"insertCompositionText",
			"insertFromComposition",
			"deleteByComposition",
			"deleteCompositionText",
		]);

		for (const inputType of COMPOSITION_INPUT_TYPES) {
			const mapping = mapBeforeInput(inputType);
			expect(mapping).toEqual({ policy: "allow" });
			expect(mapping).not.toHaveProperty("preventDefault");
			expect(mapping).not.toHaveProperty("commandName");
		}
	});

	it("B1: every command-policy map row has a DIRECT_HANDLER and no others exist", () => {
		const commandTypes = Object.keys(BEFOREINPUT_MAP).filter(
			(inputType) => "commandName" in mapBeforeInput(inputType),
		);
		expect(Object.keys(DIRECT_HANDLERS).sort()).toEqual(
			commandTypes.sort(),
		);
	});

	it("B1: unlisted inputType hits block with unhandled-input-type", () => {
		for (const inputType of SPEC_UNLISTED_TYPES) {
			expect(mapBeforeInput(inputType)).toEqual({
				policy: "block",
				code: "unhandled-input-type",
			});
		}

		expect(mapBeforeInput("not-a-real-input-type")).toEqual({
			policy: "block",
			code: "unhandled-input-type",
		});
		expect(mapBeforeInput("")).toEqual({
			policy: "block",
			code: "unhandled-input-type",
		});
	});
});
