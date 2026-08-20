export const XSS_PROBE = "window.__xssProbe()";

export const HOSTILE_HTML = {
	urls: `<p><a href="javascript:${XSS_PROBE}">javascript</a></p>
<p><a href="JaVaScRiPt:${XSS_PROBE}">mixed-case</a></p>
<p><a href="  javascript:${XSS_PROBE}">leading-space</a></p>
<p><a href="\tjavascript:${XSS_PROBE}">leading-tab</a></p>
<p><a href="vbscript:${XSS_PROBE}">vbscript</a></p>
<p><img src="javascript:${XSS_PROBE}" alt="js-src" /></p>
<p><img src="data:text/html,<script>${XSS_PROBE}</script>" alt="data-html" /></p>`,
	eventHandlers: `<p><a href="https://example.com" onclick="${XSS_PROBE}">onclick</a></p>
<p><img src="https://example.com/x.png" onerror="${XSS_PROBE}" alt="onerror" /></p>
<p onmouseover="${XSS_PROBE}">hover</p>`,
	attributeBreakout: `<p><a href="&quot; onmouseover=${XSS_PROBE}">href-breakout</a></p>
<p><a href="&quot;&gt;&lt;script&gt;${XSS_PROBE}&lt;/script&gt;">script-breakout</a></p>
<p><span style="color: red&quot; onmouseover=${XSS_PROBE}">color-breakout</span></p>
<p lang="en&quot; onmouseover=${XSS_PROBE}">lang-breakout</p>`,
	mxss: `<svg><desc><![CDATA[</desc><script>${XSS_PROBE}</script>]]></svg>
<math><mtext></mtext><script>${XSS_PROBE}</script></math>`,
	cssExpression: `<p style="background:url(javascript:${XSS_PROBE})">css-url</p>
<p style="color:expression(${XSS_PROBE})">css-expression</p>`,
	malformed: `<a href="javascript:${XSS_PROBE}" <img src=x onerror="${XSS_PROBE}">
<p><a href=javascript:${XSS_PROBE}>broken</a>
<div><span><a href="javascript:${XSS_PROBE}"><b>nested`,
} as const;

export const JAVASCRIPT_HREF = `javascript:${XSS_PROBE}`;
export const JAVASCRIPT_IMAGE_SRC = `javascript:${XSS_PROBE}`;

/** Raw JSON so `__proto__` stays an own key after `JSON.parse` in the page. */
export const HOSTILE_TOOL_INSERT_BLOCK_JSON = `[{"type":"insert-block","blockId":"hostile-tool","blockType":"paragraph","props":{"__proto__":{"polluted":true}},"position":"last"}]`;

export function oversizedDepthDocument(depth = 40): Record<string, unknown> {
	let node: Record<string, unknown> = {
		id: "leaf",
		type: "paragraph",
		props: {},
		content: { text: "leaf" },
	};
	for (let i = 1; i < depth; i += 1) {
		node = {
			id: `nest-${i}`,
			type: "toggle",
			props: {},
			children: [node],
		};
	}
	return { version: 1, blocks: [node] };
}

export function oversizedCountDocument(count = 10_001): Record<string, unknown> {
	const blocks = Array.from({ length: count }, (_, i) => ({
		id: `p-${i}`,
		type: "paragraph",
		props: {},
		content: { text: "n" },
	}));
	return { version: 1, blocks };
}
