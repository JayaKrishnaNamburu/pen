import { expect, test, type Page } from "@playwright/test";
import { loadavg } from "node:os";
import { openPlayground } from "./helpers";
import { quietPlaygroundAssist } from "./liveTrace";

const TRIP_LIMIT = 80;

type HangTripwire = {
	mutations: number;
	selectionchange: number;
	setBaseAndExtent: number;
	addRange: number;
	broke: string | null;
};

declare global {
	interface Window {
		__penHangTrip?: HangTripwire;
	}
}

function mentionTracePath(): string {
	return `/?room=pen-e2e-atom-hang-${Date.now()}-${Math.random().toString(36).slice(2, 8)}&trace=mention`;
}

async function installHangTripwire(page: Page): Promise<void> {
	await page.addInitScript((limit) => {
		const trip: HangTripwire = {
			mutations: 0,
			selectionchange: 0,
			setBaseAndExtent: 0,
			addRange: 0,
			broke: null,
		};
		window.__penHangTrip = trip;

		const OrigMO = window.MutationObserver;
		window.MutationObserver = class extends OrigMO {
			constructor(callback: MutationCallback) {
				super((records, observer) => {
					trip.mutations += 1;
					if (trip.mutations > limit) {
						trip.broke = trip.broke ?? "mutation-observer";
						return;
					}
					callback(records, observer);
				});
			}
		};

		const origAdd = EventTarget.prototype.addEventListener;
		EventTarget.prototype.addEventListener = function (
			this: EventTarget,
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | AddEventListenerOptions,
		) {
			if (type === "selectionchange" && typeof listener === "function") {
				const wrapped: EventListener = function (this: EventTarget, event) {
					trip.selectionchange += 1;
					if (trip.selectionchange > limit) {
						trip.broke = trip.broke ?? "selectionchange";
						return;
					}
					return listener.call(this, event);
				};
				return origAdd.call(this, type, wrapped, options);
			}
			return origAdd.call(this, type, listener, options);
		};

		const origSet = Selection.prototype.setBaseAndExtent;
		if (typeof origSet === "function") {
			Selection.prototype.setBaseAndExtent = function (
				this: Selection,
				anchorNode: Node,
				anchorOffset: number,
				focusNode: Node,
				focusOffset: number,
			) {
				trip.setBaseAndExtent += 1;
				if (trip.setBaseAndExtent > limit) {
					trip.broke = trip.broke ?? "setBaseAndExtent";
					return;
				}
				return origSet.call(
					this,
					anchorNode,
					anchorOffset,
					focusNode,
					focusOffset,
				);
			};
		}

		const origAddRange = Selection.prototype.addRange;
		Selection.prototype.addRange = function (this: Selection, range: Range) {
			trip.addRange += 1;
			if (trip.addRange > limit) {
				trip.broke = trip.broke ?? "addRange";
				return;
			}
			return origAddRange.call(this, range);
		};
	}, TRIP_LIMIT);
}

async function readAtomTextCompare(page: Page) {
	return page.evaluate(() => {
		const inline = document.querySelector("[data-pen-inline-content]");
		const atom = document.querySelector("[data-pen-inline-atom]");
		const editor = window.penPlayground?.editor;
		const block = editor?.firstBlock();
		const deltas =
			block && typeof block.inlineDeltas === "function"
				? block.inlineDeltas().map((delta) =>
						typeof delta.insert === "string"
							? { kind: "text", text: delta.insert }
							: {
									kind: "atom",
									type:
										delta.insert &&
										typeof delta.insert === "object" &&
										"type" in delta.insert
											? String(delta.insert.type)
											: "unknown",
								},
					)
				: [];
		return {
			domTextContent: inline?.textContent ?? null,
			blockTextContent: block?.textContent() ?? null,
			blockLength: block?.length() ?? null,
			inlineAtomCount: document.querySelectorAll("[data-pen-inline-atom]")
				.length,
			atomOuterHTML: atom instanceof HTMLElement ? atom.outerHTML : null,
			deltas,
		};
	});
}

test("ArrowLeft next to mention tripwire names the hang loop", async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName === "chromium",
		"Chromium uses EditContext; the hang is contenteditable-only.",
	);

	const loads = loadavg();
	console.log(`uptime loadavg ${loads.join(" ")} browser=${browserName}`);

	await installHangTripwire(page);
	await openPlayground(page, mentionTracePath());
	await quietPlaygroundAssist(page);

	const atom = page.locator("[data-pen-inline-atom]");
	await expect(atom).toHaveCount(1);
	const box = await atom.boundingBox();
	expect(box).not.toBeNull();

	await page.mouse.click(box!.x + box!.width + 3, box!.y + box!.height / 2);

	const before = await readAtomTextCompare(page);
	const beforeTrip = await page.evaluate(() => window.__penHangTrip);

	await page.keyboard.press("ArrowLeft");

	const afterTrip = await page.evaluate(() => window.__penHangTrip);
	const after = await readAtomTextCompare(page);
	const afterDomQuery = await page.evaluate(
		() => document.querySelectorAll("[data-pen-inline-atom]").length,
	);

	console.log(
		JSON.stringify(
			{
				browserName,
				loadavg: loads,
				before,
				beforeTrip,
				afterTrip,
				after,
				afterDomQuery,
			},
			null,
			2,
		),
	);

	expect(
		afterTrip?.broke ?? null,
		`ArrowLeft hang loop: ${JSON.stringify({
			browserName,
			loadavg: loads,
			before,
			beforeTrip,
			afterTrip,
			after,
		})}`,
	).toBeNull();
	expect(afterDomQuery).toBe(1);
});

test("ArrowLeft next to mention without tripwire (page.evaluate must return)", async ({
	page,
	browserName,
}) => {
	test.skip(
		browserName === "chromium",
		"Chromium uses EditContext; the hang is contenteditable-only.",
	);

	const loads = loadavg();
	console.log(
		`no-tripwire loadavg ${loads.join(" ")} browser=${browserName}`,
	);

	await openPlayground(page, mentionTracePath());
	await quietPlaygroundAssist(page);
	const atom = page.locator("[data-pen-inline-atom]");
	await expect(atom).toHaveCount(1);
	const box = await atom.boundingBox();
	expect(box).not.toBeNull();

	const beforeCount = await page.evaluate(
		() => document.querySelectorAll("[data-pen-inline-atom]").length,
	);
	await page.mouse.click(box!.x + box!.width + 3, box!.y + box!.height / 2);
	await page.keyboard.press("ArrowLeft");
	const afterCount = await page.evaluate(
		() => document.querySelectorAll("[data-pen-inline-atom]").length,
	);
	console.log(
		JSON.stringify({ browserName, loadavg: loads, beforeCount, afterCount }),
	);
	expect(afterCount).toBe(1);
});
