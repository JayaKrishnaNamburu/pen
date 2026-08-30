/**
 * Shared local-dev port table for playground, docs, and examples.
 *
 * `pnpm dev` starts every workspace `dev` task. These ports must stay
 * unique, and each Vite config must set `strictPort: true`, so Vite
 * does not hop when two apps race for 5173.
 *
 * Every one of those tasks is persistent, and turbo refuses to start when
 * its concurrency limit does not leave a slot for each one plus a spare —
 * `pnpm dev` fails before a single server boots. The limit lives on the
 * root `dev` script rather than in `turbo.json`, because the `turbo.json`
 * field is global and would widen `build`, `test`, and `typecheck` too.
 * That makes it a number that rots as packages are added, so it is checked
 * here against the workspace it has to cover.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEV_PORTS = Object.freeze({
	playground: 5173,
	docs: 5174,
	exampleReact: 5175,
	exampleVue: 5176,
	exampleVanilla: 5177,
});

export const DEV_PORT_CONFIGS = Object.freeze([
	{
		id: "playground",
		port: DEV_PORTS.playground,
		configRel: path.join("playground", "vite.config.ts"),
	},
	{
		id: "docs",
		port: DEV_PORTS.docs,
		configRel: path.join("packages", "docs", "vite.config.ts"),
	},
	{
		id: "example-react",
		port: DEV_PORTS.exampleReact,
		configRel: path.join("examples", "react", "vite.config.ts"),
	},
	{
		id: "example-vue",
		port: DEV_PORTS.exampleVue,
		configRel: path.join("examples", "vue", "vite.config.ts"),
	},
	{
		id: "example-vanilla",
		port: DEV_PORTS.exampleVanilla,
		configRel: path.join("examples", "vanilla", "vite.config.ts"),
	},
]);

export function assertDevPorts(configs = DEV_PORT_CONFIGS) {
	const seen = new Map();
	for (const entry of configs) {
		if (!Number.isInteger(entry.port)) {
			throw new Error(`${entry.id} is missing an integer port`);
		}
		const owner = seen.get(entry.port);
		if (owner) {
			throw new Error(
				`dev port ${entry.port} is assigned to both ${owner} and ${entry.id}`,
			);
		}
		seen.set(entry.port, entry.id);
	}
}

export function assertViteConfigsBindPorts(
	repoRoot,
	configs = DEV_PORT_CONFIGS,
) {
	for (const entry of configs) {
		const configPath = path.join(repoRoot, entry.configRel);
		const source = readFileSync(configPath, "utf8");
		if (!source.includes(`port: ${entry.port}`)) {
			throw new Error(
				`${entry.configRel} does not bind port ${entry.port}`,
			);
		}
		if (!source.includes("strictPort: true")) {
			throw new Error(`${entry.configRel} is missing strictPort: true`);
		}
		if (!source.includes("optimizeDeps")) {
			throw new Error(`${entry.configRel} is missing optimizeDeps`);
		}
		if (!source.includes("@input/pen-")) {
			throw new Error(
				`${entry.configRel} does not exclude workspace Pen packages`,
			);
		}
	}
}

// pnpm-workspace.yaml globs, flattened to the trees they cover.
const WORKSPACE_ROOTS = Object.freeze(["packages", "examples", "playground"]);

export function countDevTasks(repoRoot) {
	let count = 0;
	for (const root of WORKSPACE_ROOTS) {
		count += countDevTasksIn(path.join(repoRoot, root));
	}
	return count;
}

function countDevTasksIn(dir) {
	let count = hasDevScript(path.join(dir, "package.json")) ? 1 : 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory() && entry.name !== "node_modules") {
			count += countDevTasksIn(path.join(dir, entry.name));
		}
	}
	return count;
}

function hasDevScript(packageJsonPath) {
	let source;
	try {
		source = readFileSync(packageJsonPath, "utf8");
	} catch {
		return false;
	}
	return typeof JSON.parse(source).scripts?.dev === "string";
}

export function parseDevConcurrency(devScript) {
	const match = /--concurrency=(\d+)/.exec(devScript ?? "");
	return match ? Number(match[1]) : null;
}

export function assertConcurrencyCovers(configured, devTasks) {
	// turbo wants a free slot beyond the persistent set, so the limit has to
	// clear the task count rather than match it.
	const required = devTasks + 1;
	if (configured === null) {
		throw new Error(
			`root dev script must pass --concurrency=${required} or more; ${devTasks} workspace dev tasks are persistent`,
		);
	}
	if (configured < required) {
		throw new Error(
			`root dev script sets --concurrency=${configured}, but ${devTasks} workspace dev tasks need at least ${required}`,
		);
	}
}

export function assertDevConcurrency(repoRoot) {
	const rootManifest = JSON.parse(
		readFileSync(path.join(repoRoot, "package.json"), "utf8"),
	);
	assertConcurrencyCovers(
		parseDevConcurrency(rootManifest.scripts?.dev),
		countDevTasks(repoRoot),
	);
}

function rejects(assertion, message) {
	try {
		assertion();
	} catch {
		return;
	}
	throw new Error(`self-test: ${message}`);
}

function selfTest() {
	rejects(
		() =>
			assertDevPorts([
				{ id: "a", port: 5173 },
				{ id: "b", port: 5173 },
			]),
		"two apps sharing a port must fail",
	);
	rejects(
		() => assertDevPorts([{ id: "a", port: "5173" }]),
		"a non-integer port must fail",
	);
	if (parseDevConcurrency("turbo run dev --concurrency=32") !== 32) {
		throw new Error("self-test: --concurrency=32 must read as 32");
	}
	rejects(
		() => assertConcurrencyCovers(parseDevConcurrency("turbo run dev"), 4),
		"a dev script with no concurrency limit must fail",
	);
	rejects(
		() => assertConcurrencyCovers(4, 4),
		"a limit that only matches the task count must fail",
	);
	assertConcurrencyCovers(5, 4);
}

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
	const repoRoot = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
	);
	selfTest();
	console.log(
		"pen-dev-vite self-test ok (a shared port, a non-integer port, a missing concurrency limit, and a limit that only matches the task count all fail closed)",
	);
	assertDevPorts();
	assertViteConfigsBindPorts(repoRoot);
	assertDevConcurrency(repoRoot);
	console.log(
		`OK: ${DEV_PORT_CONFIGS.length} apps hold strict ports ${DEV_PORTS.playground}-${DEV_PORTS.exampleVanilla}; ${countDevTasks(repoRoot)} persistent dev tasks fit the root concurrency limit.`,
	);
}
