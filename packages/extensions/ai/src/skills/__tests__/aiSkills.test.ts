import { describe, expect, it } from "vitest";
import type { AIToolDescriptor } from "../../tools";
import type { AutocompleteProviderDescriptor } from "../../autocomplete";
import {
	listDefaultAISkills,
	renderSkillFiles,
	type AISkillDefinition,
	type AISkillFile,
	type AISkillScript,
} from "../index";

const tools: readonly AIToolDescriptor[] = [
	{
		name: "read_document",
		description: "Read document content.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "write_document",
		description: "Write document content.",
		inputSchema: { type: "object", properties: {} },
	},
];

const providers: readonly AutocompleteProviderDescriptor[] = [
	{
		id: "route-hint",
		description: "Adds the current route to autocomplete context.",
		kind: "consumer",
	},
];

const hostAuthoredSkill: AISkillDefinition = {
	name: "custom-review",
	title: "Custom Review",
	description: "Host-authored skill with no bundled extras.",
	tools: [],
	usage: "Use when the host wants a skill Pen does not ship.",
	instructions: ["Read the document.", "Return a short review."],
};

function skillByName(
	skills: readonly AISkillDefinition[],
	name: string,
): AISkillDefinition {
	const skill = skills.find((entry) => entry.name === name);
	if (!skill) {
		throw new Error(`Expected skill ${name}`);
	}
	return skill;
}

function fileByPath(files: readonly AISkillFile[], path: string): AISkillFile {
	const file = files.find((entry) => entry.path === path);
	if (!file) {
		throw new Error(`Expected file ${path}`);
	}
	return file;
}

describe("@input/pen-ai/skills", () => {
	it("lists only the document-agent skill when no provider descriptors are supplied", () => {
		const skills = listDefaultAISkills(tools);

		expect(skills.map((skill) => skill.name)).toEqual([
			"pen-document-agent",
		]);
		expect(skills[0]?.tools).toEqual(tools);
	});

	it("omits the autocomplete skill when provider descriptors are empty", () => {
		expect(
			listDefaultAISkills(tools, { autocompleteProviders: [] }).map(
				(skill) => skill.name,
			),
		).toEqual(["pen-document-agent"]);
	});

	it("includes an autocomplete-context skill when provider descriptors are supplied", () => {
		const skills = listDefaultAISkills(tools, {
			autocompleteProviders: providers,
		});

		expect(skills.map((skill) => skill.name)).toEqual([
			"pen-document-agent",
			"pen-autocomplete-context",
		]);
		expect(skillByName(skills, "pen-autocomplete-context").tools).toEqual(
			[],
		);
	});

	it("renders SKILL.md with frontmatter, numbered instructions, tools, and the closer", () => {
		const skill = skillByName(
			listDefaultAISkills(tools),
			"pen-document-agent",
		);
		const markdown = fileByPath(
			renderSkillFiles(skill),
			"pen-document-agent/SKILL.md",
		).content;

		expect(markdown).toBe(
			[
				"---",
				"name: pen-document-agent",
				`description: ${skill.description}`,
				"---",
				"",
				`# ${skill.title}`,
				"",
				skill.description,
				"",
				"## How It Works",
				"",
				"1. Prefer read-focused tools before mutation tools so the agent builds enough context.",
				"2. Treat @input/pen-ai/tools as the source of truth; the skill only packages instructions and helper artifacts for agents.",
				"3. Return concise summaries of the mutations you apply and note any tools you used.",
				"",
				"## Usage",
				"",
				skill.usage,
				"",
				"## Tools",
				"",
				"- `read_document` - Read document content.",
				"- `write_document` - Write document content.",
				"",
				"## Present Results to User",
				"",
				"Summarize the document changes, list the most relevant tools you used, and flag any follow-up review the user should do.",
				"",
			].join("\n"),
		);
	});

	it("renders autocomplete SKILL.md without inventing tools", () => {
		const skill = skillByName(
			listDefaultAISkills(tools, { autocompleteProviders: providers }),
			"pen-autocomplete-context",
		);
		const markdown = fileByPath(
			renderSkillFiles(skill),
			"pen-autocomplete-context/SKILL.md",
		).content;

		expect(markdown).toBe(
			[
				"---",
				"name: pen-autocomplete-context",
				`description: ${skill.description}`,
				"---",
				"",
				`# ${skill.title}`,
				"",
				skill.description,
				"",
				"## How It Works",
				"",
				"1. Read provider descriptors before proposing autocomplete prompt changes so you understand the existing context surface.",
				"2. Keep runtime autocomplete context bounded, read-only, and cheap; provider descriptors document that boundary for agents.",
				"3. When suggesting new providers, explain why they belong on the autocomplete hot path and what their latency or size budget should be.",
				"",
				"## Usage",
				"",
				skill.usage,
				"",
				"## Tools",
				"",
				"",
				"",
				"## Present Results to User",
				"",
				"Summarize the document changes, list the most relevant tools you used, and flag any follow-up review the user should do.",
				"",
			].join("\n"),
		);
		expect(markdown).not.toContain("`read_document`");
		expect(markdown).not.toContain("`write_document`");
	});

	it("renders document-agent scripts and tool references from the listed skill", () => {
		const files = renderSkillFiles(
			skillByName(listDefaultAISkills(tools), "pen-document-agent"),
		);

		expect(files.map((file) => file.path)).toEqual([
			"pen-document-agent/SKILL.md",
			"pen-document-agent/scripts/print-tools.sh",
			"pen-document-agent/references/tools.json",
		]);
		expect(
			fileByPath(files, "pen-document-agent/scripts/print-tools.sh")
				.content,
		).toContain("- read_document: Read document content.");
		expect(
			JSON.parse(
				fileByPath(files, "pen-document-agent/references/tools.json")
					.content,
			),
		).toEqual({ tools });
	});

	it("renders autocomplete provider references as skill artifacts", () => {
		const files = renderSkillFiles(
			skillByName(
				listDefaultAISkills(tools, {
					autocompleteProviders: providers,
				}),
				"pen-autocomplete-context",
			),
		);

		expect(files.map((file) => file.path)).toEqual([
			"pen-autocomplete-context/SKILL.md",
			"pen-autocomplete-context/references/providers.json",
		]);
		expect(
			JSON.parse(
				fileByPath(
					files,
					"pen-autocomplete-context/references/providers.json",
				).content,
			),
		).toEqual({ providers });
	});

	it("renders a host-authored skill as SKILL.md only when no extras are supplied", () => {
		const files = renderSkillFiles(hostAuthoredSkill);

		expect(files.map((file) => file.path)).toEqual([
			"custom-review/SKILL.md",
		]);
		expect(files[0]?.content).toContain("name: custom-review");
		expect(files[0]?.content).toContain(
			"1. Read the document.\n2. Return a short review.",
		);
	});

	it("renders host-authored scripts and references under the skill name", () => {
		const script: AISkillScript = {
			path: "scripts/review.sh",
			content: "echo review",
		};
		const reference: AISkillFile = {
			path: "references/rubric.json",
			content: '{"checks":["tone"]}',
		};
		const skill: AISkillDefinition = {
			...hostAuthoredSkill,
			scripts: [script],
			references: [reference],
		};
		const files: readonly AISkillFile[] = renderSkillFiles(skill);

		expect(files.map((file) => file.path)).toEqual([
			"custom-review/SKILL.md",
			"custom-review/scripts/review.sh",
			"custom-review/references/rubric.json",
		]);
		expect(
			fileByPath(files, "custom-review/scripts/review.sh").content,
		).toBe("echo review");
		expect(
			fileByPath(files, "custom-review/references/rubric.json").content,
		).toBe('{"checks":["tone"]}');
	});
});
