import { describe, expect, it } from "vitest";
import * as suggestions from "../suggestions";
import * as autocomplete from "../autocomplete";
import * as skills from "../skills";
import * as tools from "../tools";
import * as stream from "../stream";

function assertNamedFunction(
	mod: Record<string, unknown>,
	barrel: string,
	name: string,
): void {
	expect(mod[name], `${barrel}.${name}`).toBeTypeOf("function");
}

function assertNamedString(
	mod: Record<string, unknown>,
	barrel: string,
	name: string,
): void {
	expect(mod[name], `${barrel}.${name}`).toBeTypeOf("string");
	expect(
		String(mod[name]).length,
		`${barrel}.${name} is empty`,
	).toBeGreaterThan(0);
}

function assertNamedNumber(
	mod: Record<string, unknown>,
	barrel: string,
	name: string,
): void {
	expect(mod[name], `${barrel}.${name}`).toBeTypeOf("number");
}

describe("SF1 merged subpath barrels", () => {
	it("suggestions barrel re-exports the former suggestions satellite root", () => {
		const exported = Object.keys(suggestions);
		expect(exported.length, "suggestions barrel is empty").toBeGreaterThan(
			0,
		);
		const mod = suggestions as unknown as Record<string, unknown>;
		assertNamedFunction(mod, "suggestions", "aiSuggestionsExtension");
		assertNamedFunction(mod, "suggestions", "getAISuggestionsController");
		assertNamedFunction(mod, "suggestions", "parseSuggestionResponse");
		assertNamedFunction(mod, "suggestions", "buildAISuggestionMessages");
		assertNamedString(mod, "suggestions", "AI_SUGGESTIONS_EXTENSION_NAME");
		assertNamedString(mod, "suggestions", "AI_SUGGESTIONS_SYSTEM_PROMPT");
		assertNamedNumber(mod, "suggestions", "DEFAULT_DEBOUNCE_MS");
		assertNamedNumber(mod, "suggestions", "DEFAULT_CACHE_TTL_MS");
	});

	it("autocomplete barrel re-exports the former autocomplete satellite root", () => {
		const exported = Object.keys(autocomplete);
		expect(exported.length, "autocomplete barrel is empty").toBeGreaterThan(
			0,
		);
		const mod = autocomplete as unknown as Record<string, unknown>;
		assertNamedFunction(mod, "autocomplete", "autocompleteExtension");
		assertNamedFunction(mod, "autocomplete", "getAutocompleteController");
		assertNamedFunction(mod, "autocomplete", "createAutocompleteProvider");
		assertNamedString(
			mod,
			"autocomplete",
			"AI_AUTOCOMPLETE_EXTENSION_NAME",
		);
		assertNamedString(mod, "autocomplete", "AUTOCOMPLETE_SYSTEM_PROMPT");
		expect(
			Array.isArray(autocomplete.builtinAutocompleteProviders),
			"autocomplete.builtinAutocompleteProviders is not an array",
		).toBe(true);
		expect(
			autocomplete.builtinAutocompleteProviders.length,
			"autocomplete.builtinAutocompleteProviders is empty",
		).toBeGreaterThan(0);
		expect(
			autocomplete.builtinAutocompleteProviders[0],
			"autocomplete.builtinAutocompleteProviders[0]",
		).toEqual(
			expect.objectContaining({
				id: expect.any(String),
				provide: expect.any(Function),
			}),
		);
	});

	it("skills barrel re-exports the former skills satellite root", () => {
		const exported = Object.keys(skills);
		expect(exported.length, "skills barrel is empty").toBeGreaterThan(0);
		const mod = skills as unknown as Record<string, unknown>;
		assertNamedFunction(mod, "skills", "listDefaultAISkills");
		assertNamedFunction(mod, "skills", "renderSkillFiles");
		const listed = skills.listDefaultAISkills([]);
		expect(
			Array.isArray(listed),
			"skills.listDefaultAISkills([]) is not an array",
		).toBe(true);
		expect(
			listed.length,
			"skills.listDefaultAISkills([]) is empty",
		).toBeGreaterThan(0);
		expect(listed[0], "skills.listDefaultAISkills()[0]").toEqual(
			expect.objectContaining({
				name: expect.any(String),
				title: expect.any(String),
				tools: expect.any(Array),
			}),
		);
	});

	it("tools barrel re-exports the former tools satellite root", () => {
		const exported = Object.keys(tools);
		expect(exported.length, "tools barrel is empty").toBeGreaterThan(0);
		const mod = tools as unknown as Record<string, unknown>;
		assertNamedFunction(mod, "tools", "getAIToolRuntime");
		assertNamedFunction(mod, "tools", "listAITools");
		assertNamedFunction(mod, "tools", "executeAITool");
		assertNamedFunction(mod, "tools", "openAIToolCall");
		assertNamedFunction(mod, "tools", "authorizeAIToolCall");
		assertNamedFunction(mod, "tools", "createAIToolTurn");
		assertNamedFunction(mod, "tools", "isAIToolCallDenied");
		assertNamedFunction(mod, "tools", "AIToolContextImpl");
		assertNamedFunction(mod, "tools", "AIToolRuntimeImpl");
		assertNamedNumber(mod, "tools", "AI_AGENTIC_MAX_STEPS_DEFAULT");
		assertNamedNumber(mod, "tools", "AI_TOOL_MAX_CALLS_PER_TURN");
		expect(
			Array.isArray(tools.AI_DESTRUCTIVE_TOOL_NAMES),
			"tools.AI_DESTRUCTIVE_TOOL_NAMES is not an array",
		).toBe(true);
		expect(
			tools.AI_DESTRUCTIVE_TOOL_NAMES.length,
			"tools.AI_DESTRUCTIVE_TOOL_NAMES is empty",
		).toBeGreaterThan(0);
	});

	it("stream barrel re-exports the former delta-stream satellite root", () => {
		const exported = Object.keys(stream);
		expect(exported.length, "stream barrel is empty").toBeGreaterThan(0);
		const mod = stream as unknown as Record<string, unknown>;
		assertNamedFunction(mod, "stream", "deltaStreamExtension");
		assertNamedFunction(mod, "stream", "processStream");
	});
});
