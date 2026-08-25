import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOM_SRC = join(HERE, "..");
const PACKAGES = join(HERE, "../../../..");
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo"]);
const SYMBOL = ["get", "Selection", "Point", "Rect"].join("");
const BRIDGE = /(?:^|\/)field-editor\/selectionBridge[^/]*\.ts$/;

function listTsFiles(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listTsFiles(path));
			continue;
		}
		if (entry.name.endsWith(".ts")) files.push(path);
	}
	return files;
}

function hitsOutsideBridge(
	files: ReadonlyArray<{ path: string; source: string }>,
): string[] {
	const hits: string[] = [];
	for (const file of files) {
		if (BRIDGE.test(file.path.replaceAll("\\", "/"))) continue;
		if (file.source.includes(SYMBOL)) hits.push(file.path);
	}
	return hits;
}

function workspaceSources(): Array<{ path: string; source: string }> {
	return listTsFiles(PACKAGES).map((file) => ({
		path: relative(PACKAGES, file).replaceAll("\\", "/"),
		source: readFileSync(file, "utf8"),
	}));
}

describe("Wave 03 selection-point-rect consumers", () => {
	it("selectionGeometry.ts is gone", () => {
		expect(
			existsSync(join(DOM_SRC, "field-editor/selectionGeometry.ts")),
		).toBe(false);
	});

	it("no consumers outside the selection bridge", () => {
		expect(hitsOutsideBridge(workspaceSources())).toEqual([]);
	});

	it("the scoped gate fails by name when a consumer appears", () => {
		expect(
			hitsOutsideBridge([
				{
					path: "rendering/react/src/primitives/editor/caretOverlay.ts",
					source: `export function place() { return ${SYMBOL}(root, point); }\n`,
				},
			]),
		).toEqual(["rendering/react/src/primitives/editor/caretOverlay.ts"]);
	});

	it("the field-editor barrel and package index do not re-export the symbol", () => {
		const barrel = readFileSync(
			join(DOM_SRC, "field-editor/index.ts"),
			"utf8",
		);
		const index = readFileSync(join(DOM_SRC, "index.ts"), "utf8");
		expect(barrel.includes(SYMBOL)).toBe(false);
		expect(index.includes(SYMBOL)).toBe(false);
	});
});
