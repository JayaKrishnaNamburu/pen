#!/usr/bin/env node
/**
 * CI configuration gate.
 *
 * Every other gate in this repository checks the product. This one checks
 * the thing that runs the gates, because a workflow can stop protecting the
 * repository without anybody noticing: the jobs still appear, still go
 * green, and no longer block anything.
 *
 * Five properties, each closing a hole that produces a merge nobody
 * reviewed:
 *
 *   COVERAGE   A workflow that fans out ends in one aggregate job that
 *              depends on every other job in the file. Branch protection
 *              requires that one name. Add a matrix leg, a gate, or a whole
 *              job and it is required the moment it exists. Forget to wire
 *              it into `needs` and this fails — which is the point, since
 *              that job would otherwise run, report, and gate nothing.
 *
 *   ALWAYS     The aggregate job sets `if: always()`. Without it a failed
 *              dependency skips the aggregate, and a skipped required check
 *              is not a failing one. The pull request goes green by
 *              omission. This is the subtlest of the five and the reason
 *              the rest are worth checking mechanically.
 *
 *   TIMEOUT    Every job sets timeout-minutes. The GitHub default is six
 *              hours per job; a hung browser or a wedged dev server holds a
 *              runner for that long and starves every other contributor.
 *
 *   PERMS      Every workflow sets top-level `permissions`. Without it the
 *              job inherits the repository default, which may be
 *              read/write. Fork pull requests get a read-only token
 *              regardless, so this is about what runs on push to main.
 *
 *   PINNED     Third-party actions are pinned to a commit SHA. Tags and
 *              branches are mutable: `changesets/action@v1` is a branch,
 *              and that step holds the npm token. Actions under actions/
 *              and github/ are exempt — they are GitHub-owned, and
 *              dependabot updates both forms anyway.
 *
 *   CONTEXT    A composite action manifest references no job-level context.
 *              The runner evaluates expressions while it parses the
 *              manifest, where `needs` and `matrix` do not exist, so one
 *              such expression — even inside an input's description, which
 *              reads as documentation — fails the whole action at load
 *              time. Every caller dies with a template error that names the
 *              action rather than the job. This rule exists because
 *              `${{ toJSON(needs) }}` sat in require-jobs' own description
 *              and took every aggregate job in the repository down with it.
 *
 * Fails closed on a walk that finds no workflows. Self-tests on every run
 * so a checker that cannot fail is visible.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const WORKFLOW_DIR = ".github/workflows";
const ACTION_DIR = ".github/actions";

/**
 * Contexts that exist only once a job is running. A composite action
 * manifest is parsed before that, so naming one here is a load-time error
 * rather than an empty string. `inputs.needs` is how a caller passes the
 * real thing in, which is why the match below ignores property positions.
 */
const JOB_ONLY_CONTEXTS = ["needs", "matrix", "strategy", "secrets"];

const EXPRESSION_RE = /\$\{\{(.*?)\}\}/gs;

/**
 * Action owners exempt from SHA pinning. GitHub controls these namespaces;
 * a compromised tag there is a platform incident, not a supply-chain one
 * this repository can defend against by pinning.
 */
const TRUSTED_ACTION_OWNERS = new Set(["actions", "github"]);

/** Local composite actions, which are just paths into this repository. */
const LOCAL_ACTION_PREFIX = "./";

/** The action that makes a job an aggregate. See findAggregate. */
const AGGREGATE_ACTION = ".github/actions/require-jobs";

const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * Only pull-request workflows gate a contribution. The scheduled and
 * release workflows report to maintainers and are exempt from the
 * aggregation rules; a single-job workflow is exempt too, because that
 * job's own name is already a stable required check.
 */
export function needsAggregate(workflow) {
	return (
		runsOnPullRequest(workflow) &&
		Object.keys(workflow.jobs ?? {}).length > 1
	);
}

export function runsOnPullRequest(workflow) {
	// A bare `pull_request:` key parses to null, so test for the key rather
	// than its value. `on` is also the YAML 1.1 spelling of true, which some
	// parsers hand back as a boolean key.
	const on = workflow.on ?? workflow.true;
	if (on == null) {
		return false;
	}
	if (typeof on === "string") {
		return on === "pull_request";
	}
	if (Array.isArray(on)) {
		return on.includes("pull_request");
	}
	return Object.hasOwn(on, "pull_request");
}

/**
 * The aggregate is whichever job calls the require-jobs action. Finding it
 * structurally rather than by name or by fan-in keeps a genuine downstream
 * job — a deploy that must not run when its build failed — from being
 * mistaken for one.
 */
export function findAggregate(jobs) {
	for (const [id, job] of Object.entries(jobs)) {
		const aggregates = (job?.steps ?? []).some((step) =>
			String(step?.uses ?? "").endsWith(AGGREGATE_ACTION),
		);
		if (aggregates) {
			return { id, job, needs: normalizeNeeds(job?.needs) };
		}
	}
	return null;
}

function normalizeNeeds(needs) {
	if (needs == null) {
		return [];
	}
	return Array.isArray(needs) ? needs : [needs];
}

export function collectActionRefs(workflow) {
	const refs = [];
	for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
		for (const step of job?.steps ?? []) {
			if (typeof step?.uses === "string") {
				refs.push({ job: jobId, uses: step.uses });
			}
		}
	}
	return refs;
}

export function isPinned(uses) {
	if (uses.startsWith(LOCAL_ACTION_PREFIX)) {
		return true;
	}
	const [target] = uses.split("#");
	const at = target.lastIndexOf("@");
	if (at === -1) {
		return false;
	}
	const owner = target.slice(0, target.indexOf("/"));
	if (TRUSTED_ACTION_OWNERS.has(owner)) {
		return true;
	}
	return SHA_RE.test(target.slice(at + 1));
}

/**
 * Job-level contexts named as expression roots in `source`. A leading dot or
 * word character means the name is a property (`inputs.needs`), which is
 * legal and is exactly how require-jobs receives its argument.
 */
export function jobOnlyContextsIn(source) {
	const found = [];
	for (const match of source.matchAll(EXPRESSION_RE)) {
		const body = match[1];
		for (const context of JOB_ONLY_CONTEXTS) {
			if (new RegExp(`(?<![.\\w-])${context}\\b`).test(body)) {
				found.push({ context, expression: match[0].trim() });
			}
		}
	}
	return found;
}

export function evaluateActionManifest({ file, source }) {
	const problems = jobOnlyContextsIn(source).map(
		({ context, expression }) => ({
			rule: "CONTEXT",
			detail: `\`${context}\` is not a context here — \`${expression}\` fails the manifest at load time, breaking every job that uses this action`,
		}),
	);
	return { kind: "action", file, jobCount: 0, problems };
}

export function evaluateWorkflow({ file, workflow }) {
	const problems = [];
	const jobs = workflow.jobs ?? {};
	const jobIds = Object.keys(jobs);

	if (workflow.permissions == null) {
		problems.push({
			rule: "PERMS",
			detail: "no top-level `permissions:` (job inherits the repo default)",
		});
	}

	for (const [id, job] of Object.entries(jobs)) {
		if (job?.["timeout-minutes"] == null) {
			problems.push({
				rule: "TIMEOUT",
				detail: `job \`${id}\` has no timeout-minutes (defaults to 6 hours)`,
			});
		}
		for (const need of normalizeNeeds(job?.needs)) {
			if (!jobIds.includes(need)) {
				problems.push({
					rule: "COVERAGE",
					detail: `job \`${id}\` needs \`${need}\`, which is not a job in this workflow`,
				});
			}
		}
	}

	for (const ref of collectActionRefs(workflow)) {
		if (!isPinned(ref.uses)) {
			problems.push({
				rule: "PINNED",
				detail: `job \`${ref.job}\` uses \`${ref.uses}\` — pin third-party actions to a commit SHA`,
			});
		}
	}

	if (needsAggregate(workflow)) {
		const aggregate = findAggregate(jobs);
		if (aggregate == null) {
			problems.push({
				rule: "COVERAGE",
				detail: `${jobIds.length} jobs and no aggregate job; branch protection would have to name each one`,
			});
		} else {
			const uncovered = jobIds.filter(
				(id) => id !== aggregate.id && !aggregate.needs.includes(id),
			);
			if (uncovered.length > 0) {
				problems.push({
					rule: "COVERAGE",
					detail: `aggregate job \`${aggregate.id}\` does not depend on: ${uncovered.join(", ")}`,
				});
			}
			if (String(aggregate.job?.if ?? "").trim() !== "always()") {
				problems.push({
					rule: "ALWAYS",
					detail: `aggregate job \`${aggregate.id}\` must set \`if: always()\` or a failed dependency skips it into a green check`,
				});
			}
		}
	}

	return { kind: "workflow", file, jobCount: jobIds.length, problems };
}

export function formatReport(results) {
	const failing = results.filter((result) => result.problems.length > 0);
	const lines = ["CI configuration integrity"];
	lines.push("");
	lines.push(
		`workflows  ${results.filter((result) => result.kind === "workflow").length}`,
	);
	lines.push(
		`jobs       ${results.reduce((total, result) => total + result.jobCount, 0)}`,
	);
	lines.push(
		`actions    ${results.filter((result) => result.kind === "action").length}`,
	);

	if (failing.length === 0) {
		lines.push("");
		lines.push(
			"OK: every workflow aggregates its jobs behind one always() check, bounds every job, declares its permissions, and pins third-party actions; no composite action names a job-level context.",
		);
		return lines.join("\n");
	}

	for (const result of failing) {
		lines.push("");
		lines.push(`FAIL ${result.file}`);
		for (const problem of result.problems) {
			lines.push(`  ${problem.rule.padEnd(9)} ${problem.detail}`);
		}
	}
	return lines.join("\n");
}

export function hasFailures(results) {
	return results.some((result) => result.problems.length > 0);
}

function assert(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

function ruleIds(result) {
	return result.problems.map((problem) => problem.rule);
}

export function runSelfTests() {
	const healthy = {
		file: "healthy.yml",
		workflow: {
			on: { pull_request: null },
			permissions: { contents: "read" },
			jobs: {
				build: {
					"timeout-minutes": 10,
					steps: [{ uses: "actions/checkout@v5" }],
				},
				gate: {
					"timeout-minutes": 5,
					if: "always()",
					needs: ["build"],
					steps: [{ uses: "./.github/actions/require-jobs" }],
				},
			},
		},
	};
	assert(
		evaluateWorkflow(healthy).problems.length === 0,
		"self-test: a well-formed workflow must pass",
	);

	const unaggregated = structuredClone(healthy);
	unaggregated.workflow.jobs.lint = { "timeout-minutes": 5, steps: [] };
	assert(
		ruleIds(evaluateWorkflow(unaggregated)).includes("COVERAGE"),
		"self-test: a job missing from the aggregate's needs must fail",
	);

	const conditional = structuredClone(healthy);
	conditional.workflow.jobs.gate.if = "success()";
	assert(
		ruleIds(evaluateWorkflow(conditional)).includes("ALWAYS"),
		"self-test: an aggregate without always() must fail",
	);

	const unbounded = structuredClone(healthy);
	delete unbounded.workflow.jobs.build["timeout-minutes"];
	assert(
		ruleIds(evaluateWorkflow(unbounded)).includes("TIMEOUT"),
		"self-test: a job with no timeout must fail",
	);

	const permissive = structuredClone(healthy);
	delete permissive.workflow.permissions;
	assert(
		ruleIds(evaluateWorkflow(permissive)).includes("PERMS"),
		"self-test: a workflow with no top-level permissions must fail",
	);

	const floating = structuredClone(healthy);
	floating.workflow.jobs.build.steps.push({ uses: "changesets/action@v1" });
	assert(
		ruleIds(evaluateWorkflow(floating)).includes("PINNED"),
		"self-test: a third-party action on a mutable tag must fail",
	);

	const danglingNeed = structuredClone(healthy);
	danglingNeed.workflow.jobs.gate.needs = ["build", "typo"];
	assert(
		ruleIds(evaluateWorkflow(danglingNeed)).includes("COVERAGE"),
		"self-test: a needs entry naming no job must fail",
	);

	const single = {
		file: "single.yml",
		workflow: {
			on: { pull_request: null },
			permissions: { contents: "read" },
			jobs: { only: { "timeout-minutes": 5, steps: [] } },
		},
	};
	assert(
		evaluateWorkflow(single).problems.length === 0,
		"self-test: a single-job workflow needs no aggregate",
	);

	const scheduled = {
		file: "nightly.yml",
		workflow: {
			on: { schedule: [{ cron: "0 3 * * *" }] },
			permissions: { contents: "read" },
			jobs: {
				fuzz: { "timeout-minutes": 40, steps: [] },
				report: { "timeout-minutes": 5, needs: ["fuzz"], steps: [] },
			},
		},
	};
	assert(
		evaluateWorkflow(scheduled).problems.length === 0,
		"self-test: a workflow that never runs on a pull request gates nothing",
	);

	// A deploy that must not run when its build failed is the shape most
	// likely to be mistaken for an aggregate. It depends on everything and
	// deliberately does not set always().
	const deploying = {
		file: "docs.yml",
		workflow: {
			on: { pull_request: null },
			permissions: { contents: "read" },
			jobs: {
				build: { "timeout-minutes": 30, steps: [] },
				deploy: { "timeout-minutes": 15, needs: ["build"], steps: [] },
			},
		},
	};
	const deployingRules = ruleIds(evaluateWorkflow(deploying));
	assert(
		deployingRules.includes("COVERAGE") &&
			!deployingRules.includes("ALWAYS"),
		"self-test: a downstream deploy is a missing aggregate, not a broken one",
	);

	assert(
		isPinned("actions/checkout@v5") &&
			isPinned("github/codeql-action/init@v4") &&
			isPinned("./.github/actions/setup") &&
			isPinned(
				"pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1",
			),
		"self-test: GitHub-owned, local, and SHA-pinned refs are accepted",
	);
	assert(
		!isPinned("dorny/paths-filter@v3") && !isPinned("some/action@main"),
		"self-test: third-party tags and branches are rejected",
	);

	assert(
		runsOnPullRequest({ on: { pull_request: null } }) &&
			runsOnPullRequest({ on: ["push", "pull_request"] }) &&
			!runsOnPullRequest({ on: { schedule: [] } }),
		"self-test: pull_request trigger detection",
	);

	// The literal line that broke every aggregate job, kept verbatim so the
	// rule is proved against the defect rather than a paraphrase of it.
	const brokenManifest = evaluateActionManifest({
		file: "require-jobs/action.yml",
		source: [
			"inputs:",
			"  needs:",
			"    description: The calling job's ${{ toJSON(needs) }}.",
			"runs:",
			"  using: composite",
		].join("\n"),
	});
	assert(
		ruleIds(brokenManifest).includes("CONTEXT"),
		"self-test: a job-level context in an action manifest must fail",
	);

	const passedThrough = evaluateActionManifest({
		file: "require-jobs/action.yml",
		source: [
			"runs:",
			"  using: composite",
			"  steps:",
			"    - shell: bash",
			"      env:",
			"        NEEDS: ${{ inputs.needs }}",
			"        SKIP: ${{ inputs.allow-skipped }}",
			'      run: echo "$NEEDS"',
		].join("\n"),
	});
	assert(
		passedThrough.problems.length === 0,
		"self-test: `inputs.needs` is the legal way to receive it and must pass",
	);

	assert(
		jobOnlyContextsIn("${{ matrix.gate.id }}").length === 1 &&
			jobOnlyContextsIn("${{ steps.read.outputs.matrix }}").length === 0,
		"self-test: a context root is a defect, the same word as a property is not",
	);
}

export function loadWorkflows(repoRoot) {
	const dir = path.join(repoRoot, WORKFLOW_DIR);
	if (!fs.existsSync(dir)) {
		return [];
	}
	return fs
		.readdirSync(dir)
		.filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
		.sort()
		.map((name) => ({
			file: `${WORKFLOW_DIR}/${name}`,
			workflow: parse(fs.readFileSync(path.join(dir, name), "utf8")),
		}));
}

/**
 * Read as text, not parsed YAML: the expression that breaks a manifest can
 * sit in any scalar, including a description, and text keeps every position
 * in scope without enumerating the schema.
 */
export function loadActionManifests(repoRoot) {
	const dir = path.join(repoRoot, ACTION_DIR);
	if (!fs.existsSync(dir)) {
		return [];
	}
	const manifests = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		for (const name of ["action.yml", "action.yaml"]) {
			const full = path.join(dir, entry.name, name);
			if (fs.existsSync(full)) {
				manifests.push({
					file: `${ACTION_DIR}/${entry.name}/${name}`,
					source: fs.readFileSync(full, "utf8"),
				});
			}
		}
	}
	return manifests.sort((a, b) => a.file.localeCompare(b.file));
}

function parseArgs(argv) {
	let repoRoot = DEFAULT_REPO_ROOT;
	let selfTestOnly = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--repo-root") {
			repoRoot = path.resolve(argv[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (arg === "--self-test") {
			selfTestOnly = true;
			continue;
		}
		throw new Error(`Unknown flag: ${arg}`);
	}
	return { repoRoot, selfTestOnly };
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	runSelfTests();
	console.log(
		"workflow-integrity self-test ok (an unaggregated job, a missing always(), an unbounded job, a default-permission workflow, a floating third-party tag, and a job-level context in an action manifest all fail closed)",
	);
	if (args.selfTestOnly) {
		return;
	}

	const workflows = loadWorkflows(args.repoRoot);
	if (workflows.length === 0) {
		console.error(
			`workflow-integrity: cannot check: ${WORKFLOW_DIR} matched 0 workflows`,
		);
		process.exitCode = 1;
		return;
	}

	const manifests = loadActionManifests(args.repoRoot);
	const results = [
		...workflows.map(evaluateWorkflow),
		...manifests.map(evaluateActionManifest),
	];
	console.log("");
	console.log(
		`population: ${workflows.length} workflows, ${manifests.length} composite actions`,
	);
	console.log(formatReport(results));
	if (hasFailures(results)) {
		process.exitCode = 1;
	}
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
	try {
		main();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
