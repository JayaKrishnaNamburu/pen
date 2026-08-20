import { expect, test, type Page } from "@playwright/test";

/**
 * SEC8 (`spec-v2/12-security.md`): Pen stays functional under
 * `script-src 'self'; style-src 'self'`. Overlay geometry uses inline
 * `style` attributes, so that is the only surface that degrades without
 * `'unsafe-inline'` on `style-src`.
 *
 * This smoke serves a production-shaped fixture (same-origin `.js` / `.css`).
 * The live Vite harness cannot take this CSP: `@vitejs/plugin-react` injects
 * an inline Refresh preamble (`/@react-refresh`, `$RefreshReg$`), which
 * `script-src 'self'` blocks. Host checklist: `SEC8-MANUAL.md`.
 */

const STRICT_CSP = "script-src 'self'; style-src 'self'";

const FIXTURE_JS = `
window.__sec8 = { scriptRan: true, violations: [] };
document.addEventListener("securitypolicyviolation", (event) => {
	window.__sec8.violations.push({
		effectiveDirective: event.effectiveDirective,
		violatedDirective: event.violatedDirective,
		blockedURI: event.blockedURI,
	});
});
`;

const FIXTURE_CSS = `
[data-pen-inline-content] {
	color: rgb(17, 17, 17);
	min-height: 1.5em;
}
[data-pen-overlay-layer] {
	pointer-events: none;
}
`;

const FIXTURE_HTML = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<title>SEC8 CSP smoke</title>
		<link rel="stylesheet" href="/sec8-csp-smoke.css" />
		<script src="/sec8-csp-smoke.js"></script>
	</head>
	<body>
		<div data-pen-editor-content>
			<p data-pen-inline-content contenteditable="true">Hello from SEC8</p>
		</div>
		<div data-pen-overlay-layer aria-hidden="true">
			<div
				data-pen-overlay-item="caret"
				style="transform: translate3d(12px, 24px, 0); left: 0px; top: 0px; width: 2px; height: 16px;"
			></div>
		</div>
		<script>window.__sec8InlineRan = true;</script>
	</body>
</html>
`;

type Sec8Violation = {
	effectiveDirective: string;
	violatedDirective: string;
	blockedURI: string;
};

type Sec8State = {
	scriptRan: boolean;
	inlineRan: boolean;
	violations: Sec8Violation[];
	surfaceColor: string;
	overlayTransform: string;
};

async function installProductionFixture(page: Page): Promise<void> {
	await page.route("**/sec8-csp-smoke.html", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "text/html; charset=utf-8",
			headers: {
				"content-security-policy": STRICT_CSP,
			},
			body: FIXTURE_HTML,
		});
	});
	await page.route("**/sec8-csp-smoke.js", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "text/javascript; charset=utf-8",
			body: FIXTURE_JS,
		});
	});
	await page.route("**/sec8-csp-smoke.css", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "text/css; charset=utf-8",
			body: FIXTURE_CSS,
		});
	});
}

async function readSec8State(page: Page): Promise<Sec8State> {
	return page.evaluate(() => {
		const surface = document.querySelector("[data-pen-inline-content]");
		const overlay = document.querySelector("[data-pen-overlay-item]");
		const bridge = (
			window as Window & {
				__sec8?: { scriptRan?: boolean; violations?: Sec8Violation[] };
				__sec8InlineRan?: boolean;
			}
		).__sec8;
		return {
			scriptRan: bridge?.scriptRan === true,
			inlineRan:
				(window as Window & { __sec8InlineRan?: boolean }).__sec8InlineRan ===
				true,
			violations: bridge?.violations ?? [],
			surfaceColor: surface ? getComputedStyle(surface).color : "",
			overlayTransform: overlay ? getComputedStyle(overlay).transform : "",
		};
	});
}

function hasDirective(violations: readonly Sec8Violation[], prefix: string): boolean {
	return violations.some(
		(violation) =>
			violation.effectiveDirective.startsWith(prefix) ||
			violation.violatedDirective.startsWith(prefix),
	);
}

test.describe("SEC8 CSP smoke", () => {
	test("SEC8: production-shaped host stays functional under script-src 'self'; style-src 'self'", async ({
		page,
	}) => {
		await installProductionFixture(page);
		await page.goto("/sec8-csp-smoke.html", { waitUntil: "domcontentloaded" });

		const surface = page.locator("[data-pen-inline-content]");
		await expect(surface).toBeVisible();
		await expect(surface).toHaveText("Hello from SEC8");
		await surface.click();
		await page.keyboard.type("!");
		await expect(surface).toContainText("Hello from SEC8!");

		const state = await readSec8State(page);
		expect(state.scriptRan).toBe(true);
		expect(state.inlineRan).toBe(false);
		expect(state.surfaceColor).toBe("rgb(17, 17, 17)");
		expect(hasDirective(state.violations, "script-src")).toBe(true);
	});

	test("SEC8: only overlay inline styles degrade without style-src 'unsafe-inline'", async ({
		page,
	}) => {
		await installProductionFixture(page);
		await page.goto("/sec8-csp-smoke.html", { waitUntil: "domcontentloaded" });

		const state = await readSec8State(page);
		expect(state.scriptRan).toBe(true);
		expect(state.surfaceColor).toBe("rgb(17, 17, 17)");
		expect(
			state.overlayTransform === "none" ||
				state.overlayTransform === "matrix(1, 0, 0, 1, 0, 0)",
		).toBe(true);
		expect(hasDirective(state.violations, "style-src")).toBe(true);
	});

	test("SEC8: Vite Refresh cannot take this CSP", async ({ page, request }) => {
		const harness = await request.get("/");
		expect(harness.ok()).toBe(true);
		const html = await harness.text();
		expect(html).toMatch(/\$RefreshReg\$|injectIntoGlobalHook|\/@react-refresh/);

		await page.route(
			(url) => url.pathname === "/" || url.pathname === "/index.html",
			async (route) => {
				if (route.request().resourceType() !== "document") {
					await route.continue();
					return;
				}
				const response = await route.fetch();
				await route.fulfill({
					response,
					headers: {
						...response.headers(),
						"content-security-policy": STRICT_CSP,
					},
				});
			},
		);

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("[data-pen-conformance-harness]")).toHaveCount(0);
		await expect(page.locator("[data-pen-inline-content]")).toHaveCount(0);
	});
});
