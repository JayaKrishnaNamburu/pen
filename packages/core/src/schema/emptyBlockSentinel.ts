/**
 * I14: the only production module that may name this character. Stamp-2 stored
 * the lone-zwsp form as a caret target; the stamp-3 load migration
 * (`stripEmptyBlockSentinels.ts`, EM3) detects that exact form and rewrites it
 * to "". Embedded copies in longer text are user content and are preserved.
 *
 * The EM4 remote heal that also lived here is deleted: it covered stamp-2
 * writers inside this tree during the 0.3 train, and there are none left.
 */
const LONE_EMPTY_BLOCK_ZWSP = "\u200B";

export function isLoneEmptyBlockZwsp(text: string): boolean {
	return text === LONE_EMPTY_BLOCK_ZWSP;
}
