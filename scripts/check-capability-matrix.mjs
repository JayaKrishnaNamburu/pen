#!/usr/bin/env node
/**
 * GATE 5.3 / HB1: the capability matrix says something falsifiable.
 *
 * A matrix is only worth writing if a cell cannot quietly become a wish. This
 * walks `packages/docs/CAPABILITY-MATRIX.md` and holds every cell to the rules
 * HB1 and HB5 state:
 *
 * - the status is one of four words, so "mostly works" cannot appear;
 * - a cell that claims reach (`supported`, `bring-your-own-ui`) names a path,
 *   and that path exists — the failure mode being a cell that cites a test
 *   someone later renamed;
 * - no claim rests on `playground/`, because the playground is the one host
 *   whose wiring proves nothing about the others (HB5);
 * - the surface columns are exactly the four declared surfaces, in order, so a
 *   row cannot drop a column and read as if it had answered.
 *
 * It deliberately does not check that a `not-supported` cell has no path: those
 * cells carry prose explaining what to use instead, and naming a file there is
 * help, not a claim.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const matrixPath = join(repoRoot, "packages/docs/CAPABILITY-MATRIX.md");

const SURFACES = ["React", "Vue", "Vanilla", "Headless"];
const STATUSES = new Set([
	"supported",
	"bring-your-own-ui",
	"not-supported",
	"planned",
]);
/** The statuses that assert the capability reaches the surface. */
const CLAIMING = new Set(["supported", "bring-your-own-ui"]);

/** A repo-relative path in prose: a slashed path ending in a real extension. */
const PATH_RE = /\b(?:packages|playground|examples|scripts|spec)\/[\w./-]*[\w-]\.(?:ts|tsx|mts|mjs|js|jsx|vue|md|json|css)\b/g;

/** ` | ` splits cells, but a cell's prose may contain a pipe in code. */
function splitRow(line) {
	return line
		.replace(/^\s*\|/, "")
		.replace(/\|\s*$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

function isCapabilityTableHeader(cells) {
	return (
		cells.length === SURFACES.length + 1 &&
		SURFACES.every((surface, index) => cells[index + 1] === surface)
	);
}

const failures = [];
const source = readFileSync(matrixPath, "utf8");
const lines = source.split("\n");

let capabilityRows = 0;
let claims = 0;
let inTable = false;

for (let index = 0; index < lines.length; index += 1) {
	const line = lines[index];
	if (!line.trimStart().startsWith("|")) {
		inTable = false;
		continue;
	}

	const cells = splitRow(line);

	if (isCapabilityTableHeader(cells)) {
		inTable = true;
		continue;
	}
	// The delimiter row under a header.
	if (inTable && cells.every((cell) => /^:?-+:?$/.test(cell))) {
		continue;
	}
	if (!inTable) {
		continue;
	}

	if (cells.length !== SURFACES.length + 1) {
		failures.push(
			`line ${index + 1}: capability row has ${cells.length} cells, expected ${
				SURFACES.length + 1
			} (capability plus ${SURFACES.length} surfaces)`,
		);
		continue;
	}

	const capability = cells[0];
	capabilityRows += 1;

	for (let surfaceIndex = 0; surfaceIndex < SURFACES.length; surfaceIndex += 1) {
		const surface = SURFACES[surfaceIndex];
		const cell = cells[surfaceIndex + 1];
		const where = `"${capability}" × ${surface} (line ${index + 1})`;

		const status = cell.match(/^`([^`]+)`/)?.[1];
		if (!status) {
			failures.push(`${where}: cell does not open with a \`status\``);
			continue;
		}
		if (!STATUSES.has(status)) {
			failures.push(
				`${where}: status \`${status}\` is outside the vocabulary (${[
					...STATUSES,
				].join(", ")})`,
			);
			continue;
		}
		if (!CLAIMING.has(status)) {
			continue;
		}

		claims += 1;
		const paths = cell.match(PATH_RE) ?? [];
		if (paths.length === 0) {
			failures.push(
				`${where}: \`${status}\` claims the capability reaches this surface but names no path proving it`,
			);
			continue;
		}
		for (const path of paths) {
			if (path.startsWith("playground/")) {
				failures.push(
					`${where}: names ${path}; the playground is the reference host, not the proof (HB5)`,
				);
			}
			if (!existsSync(join(repoRoot, path))) {
				failures.push(`${where}: names ${path}, which does not exist`);
			}
		}
	}
}

if (capabilityRows === 0) {
	failures.push(
		"found no capability rows; the surface header must read exactly: | Capability | React | Vue | Vanilla | Headless |",
	);
}

if (failures.length > 0) {
	console.error(`FAIL capability matrix (${failures.length}):`);
	for (const failure of failures) {
		console.error(`  ${failure}`);
	}
	process.exit(1);
}

console.log(
	`OK capability matrix: ${capabilityRows} capabilities × ${SURFACES.length} surfaces, ${claims} claims each naming an existing non-playground path`,
);
