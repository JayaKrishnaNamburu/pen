/**
 * HOST4 (`spec/rules/host.md`): `crypto.randomUUID` is secure-context-only, so
 * calling it directly throws on plain-HTTP origins (a phone reaching a dev server over the
 * LAN) and on Safari below 15.4. `createEditor()` did exactly that from a field initializer,
 * which made the editor unconstructable in environments Pen supports (audit finding F24).
 *
 * `generateId` owns the feature test and the `getRandomValues` fallback. This rule keeps it
 * the only caller, and keeps callers from hand-rolling their own fallback beside it.
 */
const HELPER_MODULE = /generateId\.[cm]?tsx?$/;

export const noBareRandomUuid = {
	meta: {
		type: "problem",
		docs: {
			description: "Generate IDs through generateId, not crypto.randomUUID",
			specRule: "HOST4",
		},
		schema: [],
		messages: {
			bareCall:
				"`crypto.randomUUID()` throws in non-secure contexts and on Safari < 15.4. Use `generateId()` from @input/pen-types (HOST4).",
		},
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		// the helper is the one place allowed to call it; that is the whole point of the helper
		if (HELPER_MODULE.test(filename)) {
			return {};
		}

		return {
			MemberExpression(node) {
				if (node.property.type !== "Identifier" || node.property.name !== "randomUUID") {
					return;
				}
				context.report({ node, messageId: "bareCall" });
			},
		};
	},
};
