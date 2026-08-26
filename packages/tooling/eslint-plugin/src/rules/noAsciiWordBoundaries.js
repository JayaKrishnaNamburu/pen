const WORD_ESCAPE = /\\[bw]/;
const WHITESPACE_RUN = /^\\s[+*]?$|^\\S[+*]?$/;

function regexSource(node) {
	if (node.type === "Literal" && node.regex) {
		return node.regex.pattern;
	}
	if (node.type === "Literal" && typeof node.value === "string") {
		return node.value;
	}
	if (node.type === "TemplateLiteral") {
		return node.quasis.map((quasi) => quasi.value.cooked ?? "").join("");
	}
	return null;
}

function reportsWordLogic(source) {
	return WORD_ESCAPE.test(source) || WHITESPACE_RUN.test(source);
}

/**
 * LOC4 (`spec/rules/localization.md`): word and character boundaries come from
 * `Intl.Segmenter` via the shared helpers. `\b`, `\w`, and `/\s/`-run word
 * logic encode "words are Latin letters separated by spaces".
 */
export const noAsciiWordBoundaries = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Ban ASCII word-boundary regex in editing, search, and selection paths",
			specRule: "LOC4",
		},
		schema: [],
		messages: {
			asciiWord:
				"ASCII word logic (`\\b`, `\\w`, `/\\s/` runs) is banned. Use the shared segmenter helpers (LOC4).",
		},
	},
	create(context) {
		function check(node, source) {
			if (source != null && reportsWordLogic(source)) {
				context.report({ node, messageId: "asciiWord" });
			}
		}

		return {
			Literal(node) {
				check(node, regexSource(node));
			},
			NewExpression(node) {
				if (node.callee.type !== "Identifier" || node.callee.name !== "RegExp") {
					return;
				}
				const first = node.arguments[0];
				if (first) {
					check(first, regexSource(first));
				}
			},
		};
	},
};
