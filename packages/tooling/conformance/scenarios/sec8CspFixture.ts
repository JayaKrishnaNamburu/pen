/**
 * SEC8 (`spec/rules/security.md`): production-shaped host page for the
 * strict-CSP smoke. The live Vite harness cannot take this policy —
 * `@vitejs/plugin-react` injects an inline Refresh preamble.
 *
 * Chrome is class-based (stylesheet). The overlay uses a geometry-derived
 * inline `style` attribute, matching caret / drag / multiplayer overlays.
 */

export const SEC8_STRICT_CSP = "script-src 'self'; style-src 'self'";

export const SEC8_FIXTURE_PATH = "/sec8-csp-smoke.html";
export const SEC8_STYLESHEET_PATH = "/sec8-csp-smoke.css";
export const SEC8_PROBE_SCRIPT_PATH = "/sec8-csp-smoke.js";

export const SEC8_OVERLAY_INLINE_STYLE =
	"position: fixed; left: 48px; top: 36px; transform: translate(12px, 24px)";

export const SEC8_CHROME_STYLESHEET = `[data-sec8-chrome] {
	display: block;
	padding: 24px;
}

[data-pen-inline-content] {
	display: block;
	min-height: 1.5em;
}

[data-sec8-overlay] {
	width: 2px;
	height: 1em;
	background: #111;
}
`;

export const SEC8_PROBE_SCRIPT = `document.documentElement.dataset.sec8Script = "ran";
`;

const INLINE_SCRIPT_TAG = /<script(?![^>]*\bsrc=)/i;

export function buildSec8CspFixturePage(): string {
	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta http-equiv="Content-Security-Policy" content="${SEC8_STRICT_CSP}" />
		<title>SEC8 CSP smoke</title>
		<link rel="stylesheet" href="${SEC8_STYLESHEET_PATH}" />
	</head>
	<body>
		<div data-pen-conformance-harness="" data-sec8-chrome="">
			<div data-pen-editor-block="">
				<div data-pen-inline-content="">Hello SEC8</div>
			</div>
		</div>
		<div
			data-pen-editor-caret-overlay=""
			data-sec8-overlay=""
			style="${SEC8_OVERLAY_INLINE_STYLE}"
		></div>
		<script type="module" src="${SEC8_PROBE_SCRIPT_PATH}"></script>
	</body>
</html>
`;
}

export function fixturePageHasInlineScriptTag(html: string): boolean {
	return INLINE_SCRIPT_TAG.test(html);
}
