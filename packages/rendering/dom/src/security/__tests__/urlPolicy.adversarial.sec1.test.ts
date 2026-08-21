// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { urlPolicyFacet } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { Editor } from "@input/pen-types";
import { createMarkedNode } from "../../field-editor/reconcilerMarks";
import { createDocumentTree } from "../../host/documentTree";
import { urlPolicy, type UrlContext, type UrlPolicy } from "../urlPolicy";

const CONTEXTS: UrlContext[] = ["link", "image", "media", "download"];

const registry = {
	resolveInline: () => null,
};

function assignedHrefProtocol(raw: string): string | null {
	const anchor = document.createElement("a");
	anchor.setAttribute("href", raw);
	try {
		return new URL(anchor.href, "https://pen.invalid/").protocol;
	} catch {
		return null;
	}
}

const REJECTED_SCHEMES = [
	"javascript:alert(1)",
	"JaVaScRiPt:alert(1)",
	"JAVASCRIPT:void(0)",
	"  javascript:alert(1)",
	"\tjavascript:alert(1)",
	"\njavascript:alert(1)",
	"\rjavascript:alert(1)",
	"\r\njavascript:alert(1)",
	"\u0000javascript:alert(1)",
	"javascript\t:alert(1)",
	"javascript\n:alert(1)",
	"javascript\r:alert(1)",
	"java\tscript:alert(1)",
	"java\nscript:alert(1)",
	"vbscript:msgbox(1)",
	"VbScRiPt:msgbox(1)",
	"javascript://https://example.com/%0Aalert(1)",
	"javascript:/*https://x.com*/alert(1)",
	"data:text/html,<script>alert(1)</script>",
	"DATA:TEXT/HTML,hi",
	"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
	"data:application/javascript,alert(1)",
	"data:image/svg+xml,<svg onload=alert(1)></svg>",
	"data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
	"file:///etc/passwd",
	"blob:https://example.com/1",
	"filesystem:https://example.com/temporary/x",
	"view-source:https://example.com",
	"about:blank",
	"ws://example.com",
	"wss://example.com",
	"ftp://example.com/a",
];

const SHAPED_BUT_NON_EXECUTABLE = [
	"\uFEFFjavascript:alert(1)",
	"\u2028javascript:alert(1)",
	"\u2029javascript:alert(1)",
	"javascript\u0000:alert(1)",
	"javascript&#58;alert(1)",
	"javascript&#x3a;alert(1)",
	"javascript&colon;alert(1)",
	"http:javascript:alert(1)",
	"//javascript:alert(1)",
	"/javascript:alert(1)",
	"./javascript:alert(1)",
	"https://example.com/javascript:alert(1)",
];

describe("SEC1 adversarial urlPolicy", () => {
	it("SEC1: textbook and obfuscated hostile schemes are rejected", () => {
		const leaked: string[] = [];
		for (const value of REJECTED_SCHEMES) {
			for (const context of CONTEXTS) {
				if (urlPolicy.resolve(value, context) !== null) {
					leaked.push(`${context}:${JSON.stringify(value)}`);
				}
			}
		}
		expect(leaked).toEqual([]);
	});

	it("SEC1: admitted shaped strings cannot become javascript: or vbscript: hrefs", () => {
		for (const value of SHAPED_BUT_NON_EXECUTABLE) {
			const admitted = urlPolicy.resolve(value, "link");
			if (admitted === null) {
				continue;
			}
			const protocol = assignedHrefProtocol(admitted);
			expect(
				protocol,
				`admitted ${JSON.stringify(value)} assigned as ${protocol}`,
			).not.toBe("javascript:");
			expect(protocol).not.toBe("vbscript:");
		}
	});

	it("SEC1: data:image types stay image-only; svg and html stay inert", () => {
		const png = "data:image/png;base64,aaa";
		expect(urlPolicy.resolve(png, "image")).toBe(png);
		expect(urlPolicy.resolve(png, "link")).toBe(null);
		expect(
			urlPolicy.resolve("data:image/svg+xml,<svg></svg>", "image"),
		).toBe(null);
		expect(urlPolicy.resolve("data:text/html,<b>x</b>", "image")).toBe(
			null,
		);
	});

	it("SEC1 / F1: createMarkedNode drops textbook and mixed-case javascript:", () => {
		for (const href of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"  javascript:alert(1)",
		]) {
			const node = createMarkedNode(
				"click",
				{ link: { href } },
				registry as never,
			) as HTMLElement;
			expect(node.hasAttribute("href")).toBe(false);
			expect(node.getAttribute("data-pen-blocked-url")).toBe("");
			expect(node.outerHTML).not.toContain("javascript:");
		}
	});
});

describe("SEC1 documentTree render path", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
		document.body.replaceChildren();
	});

	function mountTree(args: {
		href: string;
		policy?: UrlPolicy;
	}): HTMLElement {
		const root = document.createElement("div");
		document.body.append(root);
		const editor = {
			schema: defaultSchema,
			on: () => () => {},
			facet: (facet: unknown) =>
				facet === urlPolicyFacet ? args.policy : undefined,
			documentState: {
				blockOrder: ["p1"],
				parentOf: () => null,
			},
			getBlock: () => ({
				id: "p1",
				type: "paragraph",
				props: {},
				textContent: () => "click",
				textDeltas: () => [
					{
						insert: "click",
						attributes: { link: { href: args.href } },
					},
				],
			}),
		} as unknown as Editor;
		const fieldEditor = {
			getSnapshot: () => ({
				isEditing: false,
				focusBlockId: null,
				mode: "inline",
				activeBlockIds: [],
			}),
		};
		const tree = createDocumentTree(
			editor,
			fieldEditor as never,
			root,
		);
		cleanups.push(() => {
			tree.content.remove();
		});
		return root;
	}

	it("SEC1: javascript: link mark is inert on the host document tree", () => {
		const root = mountTree({ href: "javascript:alert(1)" });
		const anchor = root.querySelector("a");
		expect(anchor).toBeInstanceOf(HTMLAnchorElement);
		expect(anchor?.hasAttribute("href")).toBe(false);
		expect(anchor?.getAttribute("data-pen-blocked-url")).toBe("");
		expect(root.innerHTML).not.toContain("javascript:");
	});

	it("SEC1: host wrap policy is enforced on the document tree path", () => {
		const policy: UrlPolicy = {
			resolve(raw, context) {
				if (raw === "https://blocked.example/x") {
					return null;
				}
				return urlPolicy.resolve(raw, context);
			},
		};
		const root = mountTree({
			href: "https://blocked.example/x",
			policy,
		});
		const anchor = root.querySelector("a");
		expect(anchor?.hasAttribute("href")).toBe(false);
		expect(anchor?.getAttribute("data-pen-blocked-url")).toBe("");
		expect(root.innerHTML).not.toContain("blocked.example");
	});
});
