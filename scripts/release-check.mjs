import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

// Commands this script runs. Pin later as root devDependencies if desired:
//   pnpm exec publint --pack pnpm <packageDir>
//   pnpm exec attw --pack <packageDir>
//   pnpm dlx publint --pack pnpm <packageDir>
//   pnpm dlx @arethetypeswrong/cli --pack <packageDir>
// Publish (API7): changeset publish --provenance
//   uses the workflow id-token: write grant; no extra npm permission.

const requested = new Set(process.argv.slice(2));
const runAll = requested.size === 0;
const shouldRunVersionSync = runAll || requested.has("--version-sync");
const shouldRunPublint = runAll || requested.has("--publint");
const shouldRunAttw = runAll || requested.has("--attw");

if (!runAll) {
  for (const flag of requested) {
    if (flag !== "--version-sync" && flag !== "--publint" && flag !== "--attw") {
      console.error(`Unknown flag: ${flag}`);
      console.error("Usage: node scripts/release-check.mjs [--version-sync] [--publint] [--attw]");
      process.exit(1);
    }
  }
}

const publishedPackages = await collectPublishedPackages(path.join(repoRoot, "packages"));

if (publishedPackages.length === 0) {
  console.error("No published packages found under packages/.");
  process.exit(1);
}

let failed = false;

if (shouldRunVersionSync) {
  failed = checkVersionSync(publishedPackages) || failed;
}

if (shouldRunPublint) {
  failed = (await lintPublishedPackages(publishedPackages)) || failed;
}

if (shouldRunAttw) {
  failed = (await checkPublishedPackageTypes(publishedPackages)) || failed;
}

process.exit(failed ? 1 : 0);

function checkVersionSync(packages) {
  const versions = new Map();

  for (const pkg of packages) {
    const list = versions.get(pkg.version) ?? [];
    list.push(pkg.name);
    versions.set(pkg.version, list);
  }

  if (versions.size === 1) {
    const [version] = versions.keys();
    console.log(`Version-sync: ${packages.length} published packages share ${version}.`);
    return false;
  }

  console.error("Version-sync failed: published packages are not on a single train version.");
  for (const [version, names] of [...versions.entries()].sort()) {
    console.error(`  ${version}: ${names.join(", ")}`);
  }
  return true;
}

async function lintPublishedPackages(packages) {
  let failed = false;

  for (const pkg of packages) {
    console.log(`publint: ${pkg.name}`);
    const ok = runPackageTool({
      localBin: "publint",
      dlxSpec: "publint",
      args: ["--pack", "pnpm", pkg.dir],
      cwd: repoRoot,
    });
    if (!ok) {
      failed = true;
    }
  }

  return failed;
}

async function checkPublishedPackageTypes(packages) {
  let failed = false;

  for (const pkg of packages) {
    console.log(`are-the-types-wrong: ${pkg.name}`);
    const ok = runPackageTool({
      localBin: "attw",
      dlxSpec: "@arethetypeswrong/cli",
      args: ["--pack", pkg.dir],
      cwd: repoRoot,
    });
    if (!ok) {
      failed = true;
    }
  }

  return failed;
}

function runPackageTool(options) {
  const localBin = path.join(repoRoot, "node_modules", ".bin", options.localBin);
  const result = existsSync(localBin)
    ? spawnSync(localBin, options.args, spawnOptions(options.cwd))
    : spawnSync("pnpm", ["dlx", options.dlxSpec, ...options.args], spawnOptions(options.cwd));

  if (result.error) {
    console.error(result.error.message);
    return false;
  }

  return result.status === 0;
}

function spawnOptions(cwd) {
  return {
    cwd,
    stdio: "inherit",
    env: process.env,
  };
}

async function collectPublishedPackages(packagesRoot) {
  const packageJsonPaths = await collectPackageJsonPaths(packagesRoot);
  const published = [];

  for (const packageJsonPath of packageJsonPaths) {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
    if (packageJson.private === true || typeof packageJson.name !== "string") {
      continue;
    }
    if (typeof packageJson.version !== "string") {
      console.error(`${packageJsonPath} is published but has no version.`);
      process.exit(1);
    }
    published.push({
      name: packageJson.name,
      version: packageJson.version,
      dir: path.dirname(packageJsonPath),
    });
  }

  published.sort((left, right) => left.name.localeCompare(right.name));
  return published;
}

async function collectPackageJsonPaths(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const packageJsonPaths = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      packageJsonPaths.push(...(await collectPackageJsonPaths(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "package.json") {
      packageJsonPaths.push(entryPath);
    }
  }

  return packageJsonPaths;
}
