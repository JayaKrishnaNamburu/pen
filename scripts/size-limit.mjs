import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const baselinePath = path.join(repoRoot, ".size-limit.baseline.json");

// Stub for API7 bundle budgets. This slice records one published package.
// Remaining packages get baselines in a later slice.
//
// When size-limit is installed:
//   pnpm exec size-limit
//   pnpm dlx size-limit --config .size-limit.json
// A PR that exceeds regressionPercent may use overrideLabel once that label
// is wired in PR CI. Release always fails on a budget miss — update the
// baseline in the same train if the growth is intended.

const baseline = JSON.parse(await fs.readFile(baselinePath, "utf8"));
const regressionPercent = baseline.regressionPercent ?? 10;
const entries = baseline.entries ?? [];

if (entries.length === 0) {
  console.error(`${baselinePath} has no entries.`);
  process.exit(1);
}

let failed = false;

for (const entry of entries) {
  const artifactPath = path.join(repoRoot, entry.path);
  let bytes;

  try {
    bytes = (await fs.stat(artifactPath)).size;
  } catch {
    console.error(`size-limit: missing ${entry.path} (build the package first).`);
    failed = true;
    continue;
  }

  const limitBytes = resolveLimitBytes(entry);
  const ceiling = Math.floor(limitBytes * (1 + regressionPercent / 100));

  console.log(
    `size-limit: ${entry.name} ${bytes} B (budget ${limitBytes} B, +${regressionPercent}% ceiling ${ceiling} B)`,
  );

  if (bytes > ceiling) {
    console.error(
      `size-limit: ${entry.name} exceeds the +${regressionPercent}% ceiling. ` +
        `Update ${path.basename(baselinePath)} if the growth is intended, ` +
        `or use the ${baseline.overrideLabel ?? "size-limit-override"} label on a PR once PR CI checks this.`,
    );
    failed = true;
  }
}

process.exit(failed ? 1 : 0);

function resolveLimitBytes(entry) {
  if (typeof entry.limitBytes === "number") {
    return entry.limitBytes;
  }
  if (typeof entry.baselineBytes === "number") {
    return entry.baselineBytes;
  }
  throw new Error(`${entry.name} needs limitBytes or baselineBytes.`);
}
