import { expect, type Page } from "@playwright/test";
import { scenario } from "../src/scenario";

/**
 * Wave 6.3 browser checkpoint (08-bidi.md §3 / Tests):
 * mixed-direction rangeRects must be disjoint per-run boxes that match
 * Range.getClientRects() on the equivalent native DOM range, within 1px,
 * on chromium, webkit, and firefox. Vectors are the 6.2 BR1 strings.
 *
 * WebKit getClientRects for a range that starts at an RTL→LTR boundary
 * also emits a zero-width ghost at the RTL run's visual left. Unioning
 * that ghost with the real glyph box is what used to inflate Pen's later
 * LTR slice (hebrew-latin-ltr pair delta 17px, union still 0). After
 * packing overlapping run boxes the leftover pairwise delta is ~0.85px
 * on the "c" left edge — native "c" starts at 57 while the packed run
 * abuts the Hebrew right at 57.85. Still under PX_TOLERANCE; do not
 * widen it.
 */
const PX_TOLERANCE = 1;

const LATIN_ARABIC_LTR = "Hello مرحبا";
const ARABIC_LATIN_RTL = "مرحبا Hello";
const HEBREW_LATIN_LTR = "abאבcd";

type CaseKind = "rtl-embed-in-ltr" | "ltr-embed-in-rtl" | "cross-boundary";

type BidiRangeCase = {
	readonly id: string;
	readonly kind: CaseKind;
	readonly ruleIds: string;
	readonly text: string;
	readonly direction: "ltr" | "rtl";
	readonly from: number;
	readonly to: number;
};

const CASES: readonly BidiRangeCase[] = [
	{
		id: "latin-arabic-ltr",
		kind: "rtl-embed-in-ltr",
		ruleIds: "G3 BR3",
		text: LATIN_ARABIC_LTR,
		direction: "ltr",
		from: 0,
		to: LATIN_ARABIC_LTR.length,
	},
	{
		id: "arabic-latin-rtl",
		kind: "ltr-embed-in-rtl",
		ruleIds: "G3 BR3 DIR2",
		text: ARABIC_LATIN_RTL,
		direction: "rtl",
		from: 0,
		to: ARABIC_LATIN_RTL.length,
	},
	{
		id: "hebrew-latin-ltr",
		kind: "cross-boundary",
		ruleIds: "G3",
		text: HEBREW_LATIN_LTR,
		direction: "ltr",
		from: 1,
		to: 5,
	},
];

type SerializedRect = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

type BidiRunSnapshot = {
	from: number;
	to: number;
	level: number;
	rect: SerializedRect | null;
};

type CaseReport = {
	id: string;
	kind: CaseKind;
	text: string;
	direction: "ltr" | "rtl";
	from: number;
	to: number;
	dirAttr: string | null;
	domText: string;
	runCount: number;
	runs: BidiRunSnapshot[];
	penRects: SerializedRect[];
	nativeRects: SerializedRect[];
	penOverlapPairs: number;
	boundingBoxDisguise: boolean;
	pairDeltas: number[];
	maxDelta: number;
	unionDelta: number;
};

function caseTitle(entry: BidiRangeCase): string {
	switch (entry.kind) {
		case "rtl-embed-in-ltr":
			return `${entry.ruleIds}: RTL-embedded range inside an LTR line (${entry.id}) yields disjoint per-run rects matching native Range.getClientRects within 1px`;
		case "ltr-embed-in-rtl":
			return `${entry.ruleIds}: LTR embedding inside an RTL paragraph (${entry.id}) yields disjoint per-run rects matching native Range.getClientRects within 1px`;
		case "cross-boundary":
			return `${entry.ruleIds}: range endpoints on opposite sides of a direction boundary (${entry.id}) yield disjoint per-run rects matching native Range.getClientRects within 1px`;
		default: {
			const _exhaustive: never = entry.kind;
			return _exhaustive;
		}
	}
}

function formatReport(report: CaseReport): string {
	const pen = report.penRects.map(formatRect).join(" | ");
	const native = report.nativeRects.map(formatRect).join(" | ");
	const deltas = report.pairDeltas.map((delta) => delta.toFixed(3)).join(", ");
	return [
		`${report.kind} ${report.id} dir=${report.direction} range=[${report.from},${report.to}]`,
		`dirAttr=${report.dirAttr ?? "null"} runs=${report.runCount} ${JSON.stringify(report.runs)}`,
		`pen(${report.penRects.length}): ${pen}`,
		`native(${report.nativeRects.length}): ${native}`,
		`disjointOverlapPairs=${report.penOverlapPairs} boundingBoxDisguise=${report.boundingBoxDisguise}`,
		`pairDeltas=[${deltas}] maxDelta=${report.maxDelta.toFixed(3)}px unionDelta=${report.unionDelta.toFixed(3)}px`,
	].join("\n");
}

function formatRect(rect: SerializedRect): string {
	return `[${rect.left.toFixed(2)},${rect.top.toFixed(2)} ${rect.width.toFixed(2)}x${rect.height.toFixed(2)}]`;
}

function assertCase(report: CaseReport): void {
	const detail = formatReport(report);
	expect(
		report.penRects.length,
		`G3: Pen rangeRects was empty\n${detail}`,
	).toBeGreaterThan(0);
	expect(
		report.nativeRects.length,
		`G3: native Range.getClientRects was empty\n${detail}`,
	).toBeGreaterThan(0);
	expect(
		report.penOverlapPairs,
		`G3: Pen rangeRects overlap — not a disjoint per-run decomposition\n${detail}`,
	).toBe(0);
	expect(
		report.boundingBoxDisguise,
		`G3: Pen returned one spanning box over split native rects (bounding box in disguise)\n${detail}`,
	).toBe(false);
	expect(
		report.maxDelta,
		`G3: Pen vs native Range.getClientRects exceeded ${PX_TOLERANCE}px\n${detail}`,
	).toBeLessThanOrEqual(PX_TOLERANCE);
}

async function prepareMixedBlock(
	s: Parameters<Parameters<typeof scenario>[1]>[0],
	page: Page,
	entry: BidiRangeCase,
): Promise<string> {
	await s.load("hello-world");
	const blockId = `bidi-${entry.id}`;
	await s.apply([
		{
			type: "insert-block",
			blockId,
			blockType: "paragraph",
			props: { direction: entry.direction },
			position: "last",
		},
		{
			type: "insert-text",
			blockId,
			offset: 0,
			text: entry.text,
		},
	]);
	await expect(page.locator(`[data-block-id="${blockId}"]`)).toBeVisible();
	await expect
		.poll(async () => {
			return page.evaluate(
				({ id, expected, direction }) => {
					const block = document.querySelector(`[data-block-id="${id}"]`);
					if (!(block instanceof HTMLElement)) {
						return "missing-block";
					}
					const inline = block.querySelector("[data-pen-inline-content]");
					if (!(inline instanceof HTMLElement)) {
						return "missing-inline";
					}
					const text = inline.textContent ?? "";
					if (!text.includes(expected)) {
						return `text:${text}`;
					}
					if (direction === "rtl" && block.getAttribute("dir") !== "rtl") {
						return `dir:${block.getAttribute("dir")}`;
					}
					return "ok";
				},
				{
					id: blockId,
					expected: entry.text,
					direction: entry.direction,
				},
			);
		})
		.toBe("ok");
	return blockId;
}

async function measureCase(
	page: Page,
	blockId: string,
	entry: BidiRangeCase,
): Promise<CaseReport> {
	return page.evaluate(
		async ({ id, spec }) => {
			const GEOMETRY_IMPORTS = [
				"/@fs/Users/krijn/Code/pen/packages/rendering/dom/src/index.ts",
				"/@id/@input/pen-dom",
			];

			type Reader = {
				rangeRects(range: {
					anchor: { blockId: string; offset: number };
					focus: { blockId: string; offset: number };
				}): readonly {
					left: number;
					top: number;
					right: number;
					bottom: number;
					width: number;
					height: number;
				}[];
				lineBoxes(blockId: string): readonly {
					runs: readonly {
						run: { from: number; to: number; level: number };
						rect: {
							left: number;
							top: number;
							right: number;
							bottom: number;
							width: number;
							height: number;
						};
					}[];
				}[];
				dispose(): void;
			};

			async function loadCreateGeometryReader(): Promise<
				(options: {
					root: HTMLElement;
					observeResize: boolean;
					observeFonts: boolean;
				}) => Reader
			> {
				const errors: string[] = [];
				for (const url of GEOMETRY_IMPORTS) {
					try {
						const mod = (await import(/* @vite-ignore */ url)) as {
							createGeometryReader?: (options: {
								root: HTMLElement;
								observeResize: boolean;
								observeFonts: boolean;
							}) => Reader;
						};
						if (typeof mod.createGeometryReader === "function") {
							return mod.createGeometryReader;
						}
						errors.push(`${url}: no createGeometryReader export`);
					} catch (error) {
						errors.push(
							`${url}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
				throw new Error(
					`createGeometryReader import failed:\n${errors.join("\n")}`,
				);
			}

			function useful(rect: {
				width: number;
				height: number;
			}): boolean {
				return rect.width > 0 || rect.height > 0;
			}

			function serialize(rect: {
				left: number;
				top: number;
				right: number;
				bottom: number;
				width: number;
				height: number;
			}): SerializedRect {
				return {
					left: rect.left,
					top: rect.top,
					right: rect.right,
					bottom: rect.bottom,
					width: rect.width,
					height: rect.height,
				};
			}

			function unionOf(rects: readonly SerializedRect[]): SerializedRect {
				const left = Math.min(...rects.map((rect) => rect.left));
				const top = Math.min(...rects.map((rect) => rect.top));
				const right = Math.max(...rects.map((rect) => rect.right));
				const bottom = Math.max(...rects.map((rect) => rect.bottom));
				return {
					left,
					top,
					right,
					bottom,
					width: right - left,
					height: bottom - top,
				};
			}

			function edgeDelta(a: SerializedRect, b: SerializedRect): number {
				return Math.max(
					Math.abs(a.left - b.left),
					Math.abs(a.top - b.top),
					Math.abs(a.right - b.right),
					Math.abs(a.bottom - b.bottom),
				);
			}

			function overlaps(a: SerializedRect, b: SerializedRect): boolean {
				const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
				const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
				return width > 0.5 && height > 0.5;
			}

			function locateOffset(
				inline: HTMLElement,
				offset: number,
			): { node: Text; offset: number } {
				const walker = document.createTreeWalker(
					inline,
					NodeFilter.SHOW_TEXT,
				);
				let remaining = offset;
				let last: Text | null = null;
				while (walker.nextNode()) {
					const node = walker.currentNode;
					if (!(node instanceof Text)) {
						continue;
					}
					last = node;
					if (remaining <= node.data.length) {
						return { node, offset: remaining };
					}
					remaining -= node.data.length;
				}
				if (!last) {
					throw new Error(`no text nodes in ${id}`);
				}
				return { node: last, offset: last.data.length };
			}

			function nativeRects(
				inline: HTMLElement,
				from: number,
				to: number,
			): SerializedRect[] {
				const start = locateOffset(inline, Math.min(from, to));
				const end = locateOffset(inline, Math.max(from, to));
				const range = document.createRange();
				range.setStart(start.node, start.offset);
				range.setEnd(end.node, end.offset);
				return Array.from(range.getClientRects())
					.filter(useful)
					.map(serialize);
			}

			function pairDeltas(
				penRects: readonly SerializedRect[],
				nativeRects: readonly SerializedRect[],
			): number[] {
				const unused = nativeRects.map((_, index) => index);
				const deltas: number[] = [];
				for (const pen of penRects) {
					let bestIndex = -1;
					let best = Number.POSITIVE_INFINITY;
					for (const index of unused) {
						const native = nativeRects[index];
						if (!native) {
							continue;
						}
						const delta = edgeDelta(pen, native);
						if (delta < best) {
							best = delta;
							bestIndex = index;
						}
					}
					if (bestIndex < 0) {
						deltas.push(Number.POSITIVE_INFINITY);
						continue;
					}
					unused.splice(unused.indexOf(bestIndex), 1);
					deltas.push(best);
				}
				for (const index of unused) {
					const native = nativeRects[index];
					if (!native) {
						continue;
					}
					let best = Number.POSITIVE_INFINITY;
					for (const pen of penRects) {
						best = Math.min(best, edgeDelta(pen, native));
					}
					deltas.push(best);
				}
				return deltas;
			}

			function isBoundingBoxDisguise(
				penRects: readonly SerializedRect[],
				nativeList: readonly SerializedRect[],
			): boolean {
				const only = penRects[0];
				if (penRects.length !== 1 || nativeList.length < 2 || !only) {
					return false;
				}
				return edgeDelta(only, unionOf(nativeList)) <= 1;
			}

			const block = document.querySelector(`[data-block-id="${id}"]`);
			if (!(block instanceof HTMLElement)) {
				throw new Error(`missing block ${id}`);
			}
			const inline = block.querySelector("[data-pen-inline-content]");
			if (!(inline instanceof HTMLElement)) {
				throw new Error(`missing inline ${id}`);
			}

			block.style.width = "800px";
			block.style.maxWidth = "800px";
			inline.style.display = "block";
			inline.style.width = "800px";
			inline.style.whiteSpace = "nowrap";
			inline.style.font = '18px / 24px "Times New Roman", Times, serif';

			if (document.fonts?.ready) {
				await document.fonts.ready;
			}
			await new Promise<void>((resolve) => {
				requestAnimationFrame(() => resolve());
			});

			const root = document.querySelector("[data-pen-editor-root]");
			if (!(root instanceof HTMLElement)) {
				throw new Error("missing editor root");
			}

			const createGeometryReader = await loadCreateGeometryReader();
			const reader = createGeometryReader({
				root,
				observeResize: false,
				observeFonts: false,
			});

			let penRects: SerializedRect[] = [];
			let runs: BidiRunSnapshot[] = [];
			try {
				penRects = reader
					.rangeRects({
						anchor: { blockId: id, offset: spec.from },
						focus: { blockId: id, offset: spec.to },
					})
					.filter(useful)
					.map(serialize);
				runs = reader.lineBoxes(id).flatMap((line) =>
					line.runs.map((geo) => ({
						from: geo.run.from,
						to: geo.run.to,
						level: geo.run.level,
						rect: serialize(geo.rect),
					})),
				);
			} finally {
				reader.dispose();
			}

			const native = nativeRects(inline, spec.from, spec.to);
			const deltas = pairDeltas(penRects, native);
			let overlapPairs = 0;
			for (let i = 0; i < penRects.length; i += 1) {
				const left = penRects[i];
				if (!left) {
					continue;
				}
				for (let j = i + 1; j < penRects.length; j += 1) {
					const right = penRects[j];
					if (right && overlaps(left, right)) {
						overlapPairs += 1;
					}
				}
			}

			const unionDelta =
				penRects.length > 0 && native.length > 0
					? edgeDelta(unionOf(penRects), unionOf(native))
					: Number.POSITIVE_INFINITY;

			return {
				id: spec.id,
				kind: spec.kind,
				text: spec.text,
				direction: spec.direction,
				from: spec.from,
				to: spec.to,
				dirAttr: block.getAttribute("dir"),
				domText: inline.textContent ?? "",
				runCount: runs.length,
				runs,
				penRects,
				nativeRects: native,
				penOverlapPairs: overlapPairs,
				boundingBoxDisguise: isBoundingBoxDisguise(penRects, native),
				pairDeltas: deltas,
				maxDelta: deltas.length > 0 ? Math.max(...deltas) : Number.POSITIVE_INFINITY,
				unionDelta,
			};
		},
		{ id: blockId, spec: entry },
	);
}

for (const entry of CASES) {
	scenario(caseTitle(entry), async (s, page) => {
		const blockId = await prepareMixedBlock(s, page, entry);
		const report = await measureCase(page, blockId, entry);
		// numbers are the finding — keep them on the wire even when green
		console.log(`BIDI_RANGE_RECTS ${JSON.stringify(report)}`);
		assertCase(report);
	});
}
