import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const packagesRoot = path.join(repoRoot, "packages");
const repoHomepage = "https://github.com/niceperson/pen#readme";
const repoBugsUrl = "https://github.com/niceperson/pen/issues";
const repoUrl = "https://github.com/niceperson/pen.git";
const licenseValue = "SEE LICENSE IN LICENSE.md";

const rootLicense = await fs.readFile(path.join(repoRoot, "LICENSE.md"), "utf8");

const packageJsonPaths = await collectPackageJsonPaths(packagesRoot);

for (const packageJsonPath of packageJsonPaths) {
  const packageRoot = path.dirname(packageJsonPath);
  const packageDirectory = path.relative(repoRoot, packageRoot).split(path.sep).join(path.posix.sep);
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));

  if (packageJson.private === true) {
    continue;
  }

  const readmePath = path.join(packageRoot, "README.md");
  const nextPackageJson = buildPublicPackageManifest(packageJson, packageDirectory, {
    hasReadme: await exists(readmePath),
  });
  await writeJson(packageJsonPath, nextPackageJson);

  await fs.writeFile(path.join(packageRoot, "LICENSE.md"), rootLicense);
}

function buildPublicPackageManifest(packageJson, packageDirectory, options) {
  const files = ensureFiles(packageJson.files, options);
  const publishConfig = {
    ...(packageJson.publishConfig ?? {}),
    access: "public",
  };
  const exports = normalizeExports(packageJson.exports);
  const types = resolveRootTypesPath(packageJson, exports);

  const ordered = {};
  copyIfPresent(ordered, packageJson, "name");
  copyIfPresent(ordered, packageJson, "version");
  copyIfPresent(ordered, packageJson, "description");
  ordered.license = licenseValue;
  ordered.homepage = repoHomepage;
  ordered.bugs = { url: repoBugsUrl };
  ordered.repository = {
    type: "git",
    url: repoUrl,
    directory: packageDirectory,
  };
  copyIfPresent(ordered, packageJson, "type");
  ordered.publishConfig = publishConfig;
  if (exports != null) {
    ordered.exports = exports;
  }
  copyIfPresent(ordered, packageJson, "main");
  copyIfPresent(ordered, packageJson, "module");
  if (types != null) {
    ordered.types = types;
  }
  ordered.files = files;
  copyIfPresent(ordered, packageJson, "sideEffects");
  copyIfPresent(ordered, packageJson, "scripts");
  copyIfPresent(ordered, packageJson, "dependencies");
  copyIfPresent(ordered, packageJson, "peerDependencies");
  copyIfPresent(ordered, packageJson, "peerDependenciesMeta");
  copyIfPresent(ordered, packageJson, "devDependencies");

  for (const [key, value] of Object.entries(packageJson)) {
    if (!(key in ordered)) {
      ordered[key] = value;
    }
  }

  return ordered;
}

function ensureFiles(existingFiles, options) {
  const files = Array.isArray(existingFiles)
    ? existingFiles.filter((entry) => entry !== "src")
    : [];
  const requiredEntries = [
    "dist",
    "LICENSE.md",
    ...(options?.hasReadme ? ["README.md"] : []),
  ];
  for (const entry of requiredEntries) {
    if (!files.includes(entry)) {
      files.push(entry);
    }
  }
  return files;
}

function copyIfPresent(target, source, key) {
  if (key in source) {
    target[key] = source[key];
  }
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

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(targetPath, data) {
  await fs.writeFile(targetPath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeExports(exportsField) {
  if (!exportsField || typeof exportsField !== "object" || Array.isArray(exportsField)) {
    return exportsField;
  }

  return Object.fromEntries(
    Object.entries(exportsField).map(([exportPath, exportValue]) => [
      exportPath,
      normalizeExportValue(exportValue),
    ]),
  );
}

function normalizeExportValue(exportValue) {
  if (!exportValue || typeof exportValue !== "object" || Array.isArray(exportValue)) {
    return exportValue;
  }

  const nextValue = { ...exportValue };
  if ("import" in nextValue) {
    nextValue.import = normalizeModuleCondition(nextValue.import, "esm");
  }
  if ("require" in nextValue) {
    nextValue.require = normalizeModuleCondition(nextValue.require, "cjs");
  }
  if ("default" in nextValue && typeof nextValue.default === "string") {
    nextValue.types = resolveDeclarationPath(nextValue.default, "esm");
  }
  return nextValue;
}

function normalizeModuleCondition(conditionValue, format) {
  if (!conditionValue || typeof conditionValue !== "object" || Array.isArray(conditionValue)) {
    return conditionValue;
  }

  const nextValue = { ...conditionValue };
  const declarationSource =
    typeof nextValue.default === "string"
      ? nextValue.default
      : typeof nextValue.types === "string"
        ? nextValue.types
        : null;
  if (declarationSource) {
    nextValue.types = resolveDeclarationPath(declarationSource, format);
  }
  return nextValue;
}

function resolveRootTypesPath(packageJson, exportsField) {
  if (typeof packageJson.types === "string") {
    return resolveDeclarationPath(packageJson.types, "esm");
  }
  const rootImportDefault = exportsField?.["."]?.import?.default;
  if (typeof rootImportDefault === "string") {
    return resolveDeclarationPath(rootImportDefault, "esm");
  }
  return undefined;
}

function resolveDeclarationPath(value, format) {
  if (typeof value !== "string") {
    return value;
  }
  if (value.includes("/dist/")) {
    return value
      .replace(/\.mjs$/, ".d.ts")
      .replace(/\.cjs$/, ".d.cts")
      .replace(/\.js$/, format === "cjs" ? ".d.cts" : ".d.ts");
  }
  return value
    .replace("/src/", "/dist/")
    .replace(/\.tsx?$/, format === "cjs" ? ".d.cts" : ".d.ts");
}
