/**
 * Wave 4 / OP1: DocumentOp is closed at ten primitives and only shrinks.
 * An eleventh `| NameOp` member in `types/ops.ts` fails lint.
 */

const EXPECTED_COUNT = 10;

export const noNewOps = {
	meta: {
		type: "problem",
		docs: {
			description:
				"DocumentOp stays at exactly ten primitive members (OP1)",
		},
		messages: {
			count: "DocumentOp has {{count}} members; the closed union is 10 (OP1).",
			anonymous:
				"DocumentOp member {{index}} is not a named *Op interface reference (OP1).",
		},
		schema: [],
	},
	create(context) {
		const filename = context.filename ?? context.getFilename();
		if (!filename.endsWith("ops.ts")) {
			return {};
		}
		return {
			TSTypeAliasDeclaration(node) {
				if (node.id.name !== "DocumentOp") {
					return;
				}
				if (node.typeAnnotation.type !== "TSUnionType") {
					return;
				}
				// Count every member, not just the ones matching *Op: a
				// filtered count cannot see a member that evades the naming
				// pattern, so an inline `| { type: "x" }` would leave the
				// total at ten and pass.
				const members = node.typeAnnotation.types;
				if (members.length !== EXPECTED_COUNT) {
					context.report({
						node,
						messageId: "count",
						data: { count: String(members.length) },
					});
				}
				members.forEach((type, index) => {
					const named =
						type.type === "TSTypeReference" &&
						type.typeName.type === "Identifier" &&
						/[A-Z][A-Za-z]+Op$/.test(type.typeName.name);
					if (!named) {
						context.report({
							node: type,
							messageId: "anonymous",
							data: { index: String(index + 1) },
						});
					}
				});
			},
		};
	},
};
