import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { scenario } from "../src/scenario";
import type { ScenarioApi } from "../src/types";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** Must exceed `CARET_BLINK_RESUME_DELAY_MS` in caretOverlay.tsx. */
const CARET_BLINK_RESUME_WAIT_MS = 650;

const AX6_CARET_BLINK_NAME = "pen-ax6-caret-blink";

function assertPrefersReducedMotionSingleSite(): void {
	const result = spawnSync(
		"rg",
		[
			"-n",
			"prefers-reduced-motion",
			"packages/rendering",
			"--glob",
			"!**/__tests__/**",
			"--glob",
			"!**/*.{test,spec}.*",
		],
		{ cwd: REPO_ROOT, encoding: "utf8" },
	);
	if (result.status !== 0 && result.status !== 1) {
		throw new Error(result.stderr || "AX6: rg failed for prefers-reduced-motion");
	}
	const files = [
		...new Set(
			(result.stdout || "")
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => line.split(":")[0]),
		),
	];
	expect(
		files,
		`AX6 single-site: prefers-reduced-motion must live only in motion.ts\n${result.stdout}`,
	).toEqual(["packages/rendering/dom/src/a11y/motion.ts"]);
}

type RunningAnimation = {
	animationName: string | null;
	transitionProperty: string | null;
	target: string | null;
};

async function waitForCaretBlinkResume(page: Page): Promise<void> {
	await page.evaluate(
		(ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
		CARET_BLINK_RESUME_WAIT_MS,
	);
}

async function collectRunningAnimations(
	page: Page,
): Promise<RunningAnimation[]> {
	return page.evaluate(() => {
		const root = document.querySelector("[data-pen-editor-root]");
		if (!(root instanceof HTMLElement)) {
			return [];
		}
		return root
			.getAnimations({ subtree: true })
			.filter((animation) => animation.playState === "running")
			.map((animation) => {
				const effect = animation.effect;
				const target =
					effect && "target" in effect
						? (effect as KeyframeEffect).target
						: null;
				return {
					animationName:
						animation instanceof CSSAnimation
							? animation.animationName
							: null,
					transitionProperty:
						animation instanceof CSSTransition
							? animation.transitionProperty
							: null,
					target:
						target instanceof Element
							? target.tagName.toLowerCase()
							: null,
				};
			});
	});
}

async function prepareAx6Caret(s: ScenarioApi): Promise<void> {
	await s.load("hello-world");
	await s.keyboard.type("!");
	await s.assert.textContains("Hello");
	await s.assert.textContains("!");
}

scenario(
	"AX6: reduced-motion emulation keeps the editor surface free of animated frames",
	async (s, page) => {
		assertPrefersReducedMotionSingleSite();

		const media = await page.evaluate(() =>
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		);
		expect(media).toBe(true);
		expect(
			await page.evaluate(() => window.__penConformance.reducedMotion),
		).toBe(true);

		await prepareAx6Caret(s);

		const caret = page.locator("[data-pen-editor-caret]");
		await expect(caret).toBeVisible();
		await waitForCaretBlinkResume(page);
		await expect(
			caret,
			"AX6: caret animation-name must be none under reduced motion",
		).toHaveCSS("animation-name", "none");

		const running = await collectRunningAnimations(page);
		expect(running, "AX6: editor surface produced animated frames").toEqual(
			[],
		);
	},
	{
		url: "/?ax6=1",
		emulateMedia: { reducedMotion: "reduce" },
	},
);

scenario(
	"AX6: without reduced-motion the ax6 harness caret blinks",
	async (s, page) => {
		const media = await page.evaluate(() =>
			window.matchMedia("(prefers-reduced-motion: reduce)").matches,
		);
		expect(media).toBe(false);
		expect(
			await page.evaluate(() => window.__penConformance.reducedMotion),
		).toBe(false);

		await prepareAx6Caret(s);

		const caret = page.locator("[data-pen-editor-caret]");
		await expect(caret).toBeVisible();
		await waitForCaretBlinkResume(page);
		await expect(
			caret,
			"AX6: caret must blink when reduced motion is off",
		).toHaveCSS("animation-name", AX6_CARET_BLINK_NAME);

		const running = await collectRunningAnimations(page);
		expect(
			running.filter(
				(animation) => animation.animationName === AX6_CARET_BLINK_NAME,
			),
			"AX6: caret blink must be a running animation when reduced motion is off",
		).not.toEqual([]);
	},
	{
		url: "/?ax6=1",
		emulateMedia: { reducedMotion: "no-preference" },
	},
);
