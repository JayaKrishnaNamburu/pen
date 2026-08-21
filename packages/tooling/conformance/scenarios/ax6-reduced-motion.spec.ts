import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import { scenario } from "../src/scenario";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

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

		await s.load("hello-world");
		await s.keyboard.type("!");
		await s.assert.textContains("Hello");
		await s.assert.textContains("!");

		const caret = page.locator("[data-pen-editor-caret]");
		await expect(caret).toBeVisible();
		await expect(caret).toHaveCSS("animation-name", "none");

		const running = await page.evaluate(() => {
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
		expect(running, "AX6: editor surface produced animated frames").toEqual(
			[],
		);
	},
	{
		url: "/?ax6=1",
		emulateMedia: { reducedMotion: "reduce" },
	},
);
