import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFORMANCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function runPropertySuite({ nightly = false } = {}) {
	const seed = process.env.PEN_FUZZ_SEED ?? `${Date.now()}`;
	console.log(`${nightly ? "Nightly" : "Node"} fuzz seed: ${seed}`);

	const env = {
		...process.env,
		PEN_FUZZ_SEED: seed,
	};
	if (nightly) {
		env.PEN_FUZZ_NIGHTLY = "1";
	}

	return new Promise((resolve, reject) => {
		const child = spawn(
			"pnpm",
			["exec", "vitest", "run", "--config", "vitest.nightly.ts"],
			{
				cwd: CONFORMANCE_DIR,
				env,
				stdio: "inherit",
			},
		);
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`change-summary property suite exited ${code ?? "null"}`));
		});
	});
}
