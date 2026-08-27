import { expect } from "@playwright/test";
import { scenario } from "../src/scenario";

const BLOCK = "hello-p1";
const HELLO_WORLD_LENGTH = 11;

/**
 * The half of RI5 that is not about newlines. A space is a stored character
 * like any other, but CSS's initial `normal` treats a trailing one as hanging
 * white space with no advance width, so the caret is painted at the same x
 * before and after it: the space appears not to arrive until the next
 * character pushes it out of the trailing position.
 *
 * Runs unstyled so the library's own inline declaration is the only
 * `white-space` in play (HOST6), and drives a real keystroke rather than an op,
 * because the report this pins was about typing.
 */
scenario(
	"RI5: a space typed at the end of a word moves the caret with no host stylesheet",
	async (s) => {
		await s.load("hello-world");
		await s.keyboard.press("End");
		await s.assert.selectionEquals({
			anchor: { blockId: BLOCK, offset: HELLO_WORLD_LENGTH },
			focus: { blockId: BLOCK, offset: HELLO_WORLD_LENGTH },
		});

		// Measured from scratch: the claim is about layout, not cache freshness.
		const caretLeft = async (offset: number) => {
			const compare = await s.geometry.compare([
				{ blockId: BLOCK, offset, affinity: "downstream" },
			]);
			return compare.compares[0]?.fromScratch?.left ?? null;
		};

		const beforeSpace = await caretLeft(HELLO_WORLD_LENGTH);
		await s.keyboard.type(" ");
		await s.assert.textContains("Hello world ");
		const afterSpace = await caretLeft(HELLO_WORLD_LENGTH + 1);

		expect(beforeSpace).not.toBeNull();
		expect(afterSpace).not.toBeNull();
		expect(afterSpace!).toBeGreaterThan(beforeSpace!);
	},
	{ url: "/?unstyled=1" },
);
