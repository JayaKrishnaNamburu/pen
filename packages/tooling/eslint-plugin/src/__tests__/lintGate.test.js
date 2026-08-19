import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

async function lintSeededViolation(code, fileName) {
	const eslint = new ESLint({ cwd: repoRoot });
	const [result] = await eslint.lintText(code, {
		filePath: path.join(repoRoot, "packages/tooling/eslint-plugin", fileName),
	});
	return result?.messages ?? [];
}

describe("CH2 lint gate", () => {
	it("reports seeded markup injection as an error through the root config", async () => {
		const messages = await lintSeededViolation(
			'const element: HTMLElement = document.body;\nelement.innerHTML = "<b>x</b>";\n',
			"seeded-injection.ts",
		);

		expect(
			messages.filter(
				(message) => message.ruleId === "pen/no-html-injection-sinks" && message.severity === 2,
			),
		).toHaveLength(1);
	});

	it("reports seeded dynamic code as an error through the root config", async () => {
		const messages = await lintSeededViolation(
			'const run = new Function("return 1");\n',
			"seeded-dynamic-code.ts",
		);

		expect(messages.some((message) => message.severity === 2)).toBe(true);
	});
});
