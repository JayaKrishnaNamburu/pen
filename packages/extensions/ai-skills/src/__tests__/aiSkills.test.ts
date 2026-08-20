import { describe, expect, it } from "vitest";
import type { AIToolDescriptor } from "@input/pen-ai-tools";
import type { AutocompleteProviderDescriptor } from "@input/pen-ai-autocomplete";
import {
	createAutocompleteProviderSkill,
	createDocumentAgentSkill,
	listDefaultAISkills,
	renderSkillFiles,
	renderSkillMarkdown,
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

describe("@input/pen-ai-skills", () => {
	it("creates a default document skill from ai-tools descriptors", () => {
		const skills = listDefaultAISkills(tools);

		expect(skills.map((skill) => skill.name)).toEqual([
			"pen-document-agent",
		]);
		expect(skills[0]?.tools).toEqual(tools);
	});

	it("omits the autocomplete skill when no provider descriptors are supplied", () => {
		expect(
			listDefaultAISkills(tools, { autocompleteProviders: [] }).map(
				(skill) => skill.name,
			),
		).toEqual(["pen-document-agent"]);
	});

	it("includes an autocomplete provider skill when provider descriptors are supplied", () => {
		const skills = listDefaultAISkills(tools, {
			autocompleteProviders: providers,
		});

		expect(skills.map((skill) => skill.name)).toEqual([
			"pen-document-agent",
			"pen-autocomplete-context",
		]);
	});

	it("renders a skill markdown artifact", () => {
		const markdown = renderSkillMarkdown(createDocumentAgentSkill(tools));

		expect(markdown).toContain("name: pen-document-agent");
		expect(markdown).toContain("`read_document`");
		expect(markdown).toContain("## How It Works");
	});

	it("renders autocomplete provider skill markdown without inventing tools", () => {
		const markdown = renderSkillMarkdown(
			createAutocompleteProviderSkill(providers),
		);

		expect(markdown).toContain("name: pen-autocomplete-context");
		expect(markdown).toContain("## Tools");
		expect(markdown).not.toContain("`read_document`");
	});

	it("renders skill files including scripts and references", () => {
		const files = renderSkillFiles(createDocumentAgentSkill(tools));

		expect(files.map((file) => file.path)).toEqual(
			expect.arrayContaining([
				"pen-document-agent/SKILL.md",
				"pen-document-agent/scripts/print-tools.sh",
				"pen-document-agent/references/tools.json",
			]),
		);
	});

	it("renders autocomplete provider references as skill artifacts", () => {
		const files = renderSkillFiles(
			createAutocompleteProviderSkill(providers),
		);

		expect(files.map((file) => file.path)).toEqual(
			expect.arrayContaining([
				"pen-autocomplete-context/SKILL.md",
				"pen-autocomplete-context/references/providers.json",
			]),
		);
		expect(
			files.find((file) => file.path.endsWith("providers.json"))?.content,
		).toContain("route-hint");
	});

	it("renders a host-authored skill as SKILL.md only when no extras are supplied", () => {
		const files = renderSkillFiles(hostAuthoredSkill);

		expect(files.map((file) => file.path)).toEqual([
			"custom-review/SKILL.md",
		]);
		expect(files[0]?.content).toContain("name: custom-review");
	});

	it("renders host-authored scripts and references as skill files", () => {
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
			files.find((file) => file.path.endsWith("review.sh"))?.content,
		).toBe("echo review");
	});
});
