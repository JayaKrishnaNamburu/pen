import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT_DIR = process.cwd();
const ENTRY_DIRS = ["packages", "playground", "scripts"];
const SOURCE_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const SCAN_FILE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const IGNORED_DIR_NAMES = new Set([
  ".git",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) {
        continue;
      }

      const nestedFiles = await collectSourceFiles(entryPath);
      files.push(...nestedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (SCAN_FILE_EXTENSIONS.has(extension)) {
      files.push(entryPath);
    }
  }

  return files;
}

function isLocalImport(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function hasForbiddenExtension(specifier) {
  return [...SOURCE_FILE_EXTENSIONS].some((extension) => specifier.endsWith(extension));
}

function getLocation(sourceFile, start) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
  return `${line + 1}:${character + 1}`;
}

function reportViolation(violations, sourceFile, specifierNode) {
  const specifier = specifierNode.text;
  if (!isLocalImport(specifier) || !hasForbiddenExtension(specifier)) {
    return;
  }

  violations.push({
    filePath: sourceFile.fileName,
    location: getLocation(sourceFile, specifierNode.getStart(sourceFile)),
    specifier,
  });
}

function scanFile(filePath, contents) {
  const sourceFile = ts.createSourceFile(filePath, contents, ts.ScriptTarget.Latest, true);
  const violations = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      reportViolation(violations, sourceFile, node.moduleSpecifier);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      reportViolation(violations, sourceFile, node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

async function main() {
  const sourceFiles = [];

  for (const entryDir of ENTRY_DIRS) {
    const entryPath = path.join(ROOT_DIR, entryDir);
    if (!(await pathExists(entryPath))) {
      continue;
    }

    const files = await collectSourceFiles(entryPath);
    sourceFiles.push(...files);
  }

  const violations = [];

  for (const filePath of sourceFiles) {
    const contents = await fs.readFile(filePath, "utf8");
    violations.push(...scanFile(filePath, contents));
  }

  if (violations.length === 0) {
    console.log("No local import path extensions found.");
    return;
  }

  console.error("Local import paths must not include file extensions:");
  for (const violation of violations) {
    const relativePath = path.relative(ROOT_DIR, violation.filePath);
    console.error(`- ${relativePath}:${violation.location} -> ${violation.specifier}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error("Import extension check failed.", error);
  process.exit(1);
});
