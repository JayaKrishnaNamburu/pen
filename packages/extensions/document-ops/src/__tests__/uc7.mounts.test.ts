import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { documentOpsExtension } from "../documentOpsExtension";
import { getDocumentToolRuntime } from "../index";

/**
 * UC7: reads stay plural; in-editor writes stay singular. This package
 * registers both surfaces. The README is the declaration a host diffs
 * against; the runtime is what the declaration has to match.
 */

const README = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../../README.md"),
	"utf8",
);

const IN_EDITOR_READS = [
	"read_document",
	"get_context",
	"get_cursor_context",
	"search_document",
	"retrieve_document_spans",
	"list_block_types",
] as const;

const IN_EDITOR_MUTATOR = "edit_document";

const HOST_FACING_MUTATORS = [
	"insert_block",
	"update_block",
	"delete_block",
	"move_block",
	"write_document",
] as const;

const HOST_ONLY_READS = ["inspect_target", "list_valid_operations"] as const;

describe("UC7: each tool names the surface it serves", () => {
	it("UC7: the runtime registers every tool the README declares", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [documentOpsExtension()],
		});
		await editor.whenReady();
		const names = getDocumentToolRuntime(editor)!
			.listTools()
			.map((tool) => tool.name)
			.sort();
		const declared = [
			...IN_EDITOR_READS,
			IN_EDITOR_MUTATOR,
			...HOST_FACING_MUTATORS,
			...HOST_ONLY_READS,
		].sort();
		expect(names).toEqual(declared);
		editor.destroy();
	});

	it("UC7: the README states which surface each tool serves", () => {
		expect(README).toContain("## Tool surfaces");
		expect(README).toContain("in-editor loop");
		expect(README).toContain(IN_EDITOR_MUTATOR);
		for (const name of IN_EDITOR_READS) {
			expect(README, `${name} missing from README`).toContain(name);
		}
		for (const name of HOST_FACING_MUTATORS) {
			expect(README, `${name} missing from README`).toContain(
				`\`${name}\``,
			);
			expect(README).toMatch(new RegExp(`${name}[^\n]*host-facing`));
		}
	});

	it("UC7: host-facing mutators are not the in-editor write", () => {
		expect(HOST_FACING_MUTATORS).not.toContain(IN_EDITOR_MUTATOR);
	});
});
