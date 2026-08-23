#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlistPath = path.join(repoRoot, "scripts/no-new-slots-allowlist.json");

const DEFAULT_ADAPTER_FILES = ["packages/core/src/editor/editorApiHelpers.ts"];
const SCAN_ROOTS = ["packages", "playground"];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "coverage",
  "build",
  ".git",
]);
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

export function findExportedSlotNames(source) {
  const exportedSlotRe = /export\s+const\s+(\w+_SLOT(?:_KEY)?)\b/g;
  return [...source.matchAll(exportedSlotRe)].map((match) => match[1]);
}

export function hasSetSlot(source) {
  return source.includes("setSlot(");
}

export function checkNoNewSlots(files, allowlist, options = {}) {
  const adapterFiles = new Set(options.adapterFiles ?? allowlist.adapterFiles ?? DEFAULT_ADAPTER_FILES);
  const allowedExports = new Set(
    (allowlist.exportedSlots ?? []).map((entry) => `${entry.file}:${entry.name}`),
  );
  const allowedSetSlot = new Set(allowlist.setSlotFiles ?? []);
  const checkExact = options.checkExact !== false;

  const violations = [];
  const seenExports = new Set();
  const seenSetSlot = new Set();

  for (const file of files) {
    for (const name of findExportedSlotNames(file.content)) {
      const key = `${file.file}:${name}`;
      seenExports.add(key);
      if (!allowedExports.has(key)) {
        violations.push(`new exported slot ${name} in ${file.file}`);
      }
    }

    if (hasSetSlot(file.content) && !adapterFiles.has(file.file)) {
      seenSetSlot.add(file.file);
      if (!allowedSetSlot.has(file.file)) {
        violations.push(`setSlot( outside adapter in ${file.file}`);
      }
    }
  }

  if (checkExact) {
    for (const key of allowedExports) {
      if (!seenExports.has(key)) {
        violations.push(`stale allowlist exported slot ${key}`);
      }
    }
    for (const file of allowedSetSlot) {
      if (!seenSetSlot.has(file)) {
        violations.push(`stale allowlist setSlot file ${file}`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function runSM3Fixture() {
  const name = ["NEW", "SLOT", "KEY"].join("_");
  const source = `export const ${name} = "temp";\n`;
  const result = checkNoNewSlots(
    [{ file: "tmp/sm3-fixture.ts", content: source }],
    { exportedSlots: [], setSlotFiles: [] },
    { checkExact: false },
  );

  if (result.ok || !result.violations.some((line) => line.includes(name))) {
    throw new Error(`SM3: expected ${name} in a temp string to fail the checker`);
  }
}

function isTestFile(relPath) {
  const parts = relPath.split(path.sep);
  if (parts.includes("__tests__")) {
    return true;
  }
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(parts[parts.length - 1]);
}

function collectSourceFiles(absDir, relDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const absPath = path.join(absDir, entry.name);
    const relPath = path.join(relDir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(absPath, relPath, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }
    if (isTestFile(relPath)) {
      continue;
    }
    out.push(relPath.split(path.sep).join("/"));
  }
}

function loadRepoFiles() {
  const relPaths = [];
  for (const root of SCAN_ROOTS) {
    collectSourceFiles(path.join(repoRoot, root), root, relPaths);
  }
  relPaths.sort();
  return relPaths.map((file) => ({
    file,
    content: fs.readFileSync(path.join(repoRoot, file), "utf8"),
  }));
}

function loadAllowlist() {
  return JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
}

function main() {
  runSM3Fixture();
  console.log("SM3 fixture: NEW_SLOT_KEY in a temp string failed the checker.");

  const allowlist = loadAllowlist();
  const files = loadRepoFiles();
  if (files.length === 0) {
    console.error(
      "no-new-slots: cannot check: packages+playground source walk matched 0 files",
    );
    process.exit(1);
  }
  console.log(
    `population: ${files.length} files (packages+playground source, tests excluded)`,
  );
  const result = checkNoNewSlots(files, allowlist);
  if (!result.ok) {
    console.error("no-new-slots failed:");
    for (const line of result.violations) {
      console.error(`  ${line}`);
    }
    process.exit(1);
  }

  const exportCount = allowlist.exportedSlots?.length ?? 0;
  const setSlotCount = allowlist.setSlotFiles?.length ?? 0;
  console.log(
    `no-new-slots ok — ${exportCount} exported slots, ${setSlotCount} setSlot files.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
