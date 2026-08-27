import { expect } from "@playwright/test";
import { scenario } from "../src/scenario";

const BLOCK = "hello-p1";
const HELLO_WORLD_LENGTH = 11;
/** The space between the two words, which the first op turns into a newline. */
const SPACE_OFFSET = 5;
/** End of the text once a second newline has been appended. */
const TRAILING_OFFSET = HELLO_WORLD_LENGTH + 1;

/**
 * Runs unstyled so the only `white-space` declaration in play is the library's
 * own inline one. That is the whole of RI5: a soft break is a `\n` the document
 * stores, so a host that ships no CSS must still see it (HOST6).
 *
 * `s.apply` runs the standing DOM-matches-authority check after every op, so
 * the claim that the trailing `<br>` carries no logical text is asserted here
 * too, without a line of its own.
 */
scenario(
	"RI5: a stored newline renders as a line break with no host stylesheet",
	async (s, page) => {
		await s.load("hello-world");

		const blockHeight = () =>
			page.evaluate(
				(id) =>
					document
						.querySelector(`[data-block-id="${id}"]`)
						?.getBoundingClientRect().height ?? 0,
				BLOCK,
			);
		const trailingBreaks = () =>
			page.locator("[data-pen-trailing-break]").count();

		const oneLineHeight = await blockHeight();

		// "Hello world" becomes "Hello\nworld". The replaced character is a space,
		// so nothing but the break can put the second word on its own line.
		await s.apply([
			{
				type: "splice-text",
				blockId: BLOCK,
				from: SPACE_OFFSET,
				to: SPACE_OFFSET + 1,
				insert: "\n",
			},
		]);

		expect(
			await page.evaluate(() => {
				const inline = document.querySelector("[data-pen-inline-content]");
				return inline ? getComputedStyle(inline).whiteSpace : null;
			}),
		).toBe("pre-wrap");
		await expect
			.poll(async () => (await s.geometry.lineBoxes(BLOCK)).length)
			.toBe(2);

		const twoLineHeight = await blockHeight();
		expect(twoLineHeight).toBeGreaterThan(oneLineHeight);
		expect(await trailingBreaks()).toBe(0);

		// A trailing `\n` gets no line box from `pre-wrap` alone, so the break is
		// the only thing that can give the empty last line height.
		await s.apply([
			{
				type: "splice-text",
				blockId: BLOCK,
				from: HELLO_WORLD_LENGTH,
				to: HELLO_WORLD_LENGTH,
				insert: "\n",
			},
		]);

		expect(await trailingBreaks()).toBe(1);
		await expect.poll(blockHeight).toBeGreaterThan(twoLineHeight);
		// The empty last line needs a line box of its own, or vertical motion
		// steps over it into the next block and the caret cannot reach it.
		await expect
			.poll(async () => (await s.geometry.lineBoxes(BLOCK)).length)
			.toBe(3);

		// A line box the caret cannot measure onto is still unreachable. The end
		// position sits on the boundary between the two, so affinity decides:
		// downstream is the empty last line, upstream is the end of the one above.
		const lines = await s.geometry.lineBoxes(BLOCK);
		const compare = await s.geometry.compare([
			{ blockId: BLOCK, offset: TRAILING_OFFSET, affinity: "downstream" },
			{ blockId: BLOCK, offset: TRAILING_OFFSET, affinity: "upstream" },
		]);
		const [downstream, upstream] = compare.compares;
		expect(downstream?.fromScratch?.top).toBe(lines[2]!.top);
		expect(upstream?.fromScratch?.top).toBe(lines[1]!.top);

		await s.apply([
			{
				type: "splice-text",
				blockId: BLOCK,
				from: HELLO_WORLD_LENGTH,
				to: TRAILING_OFFSET,
				insert: "",
			},
		]);

		expect(await trailingBreaks()).toBe(0);
		await expect.poll(blockHeight).toBe(twoLineHeight);
	},
	{ url: "/?unstyled=1" },
);
