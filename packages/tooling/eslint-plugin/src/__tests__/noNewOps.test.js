import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { noNewOps } from "../rules/noNewOps.js";

const ruleTester = new RuleTester({
	languageOptions: {
		parser: tseslint.parser,
	},
});

const tenMembers = `
export type DocumentOp =
	| SpliceTextOp
	| FormatTextOp
	| InsertBlockOp
	| DeleteBlockOp
	| MoveBlockOp
	| SetPropsOp
	| SetMetaOp
	| GridOp
	| AppOp
	| StreamOpenOp;
`;

const elevenMembers = `
export type DocumentOp =
	| SpliceTextOp
	| FormatTextOp
	| InsertBlockOp
	| DeleteBlockOp
	| MoveBlockOp
	| SetPropsOp
	| SetMetaOp
	| GridOp
	| AppOp
	| StreamOpenOp
	| ExtraOp;
`;

describe("no-new-ops (Wave 4 / OP1)", () => {
	it("allows the ten-member DocumentOp union and fails an eleventh", () => {
		ruleTester.run("no-new-ops", noNewOps, {
			valid: [
				{
					filename: "packages/types/src/types/ops.ts",
					code: tenMembers,
				},
			],
			invalid: [
				{
					filename: "packages/types/src/types/ops.ts",
					code: elevenMembers,
					errors: [
						{
							messageId: "count",
							data: { count: "11" },
						},
					],
				},
			],
		});
	});
});
