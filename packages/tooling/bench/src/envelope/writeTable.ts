import { readFile, writeFile } from "node:fs/promises";
import { envelopeTablePath, loadCommittedEnvelope } from "./compare";
import { renderEnvelopeMarkdown } from "./table";

const check = process.argv.includes("--check");

const record = await loadCommittedEnvelope();
const markdown = renderEnvelopeMarkdown(record);
const path = envelopeTablePath();

if (check) {
	const committed = await readFile(path, "utf8");
	if (committed !== markdown) {
		console.error(
			"SCALE1 envelope table drifted from baselines/envelope.json. Regenerate with `pnpm --filter @input/pen-bench exec tsx src/envelope/writeTable.ts`.",
		);
		process.exit(1);
	}
	console.error("SCALE1 envelope table matches baselines/envelope.json");
	process.exit(0);
}

await writeFile(path, markdown, "utf8");
console.error(`Wrote ${path}`);
