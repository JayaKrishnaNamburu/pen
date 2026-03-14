import { describe, expect, it } from "vitest";
import type { AIToolDescriptor } from "@pen/ai-tools";
import {
  AISkillRegistry,
  createDocumentAgentSkill,
  listDefaultAISkills,
  renderSkillFiles,
  renderSkillMarkdown,
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

describe("@pen/ai-skills", () => {
  it("creates a default document skill from ai-tools descriptors", () => {
    const [skill] = listDefaultAISkills(tools);

    expect(skill?.name).toBe("pen-document-agent");
    expect(skill?.tools).toEqual(tools);
  });

  it("renders a skill markdown artifact", () => {
    const markdown = renderSkillMarkdown(createDocumentAgentSkill(tools));

    expect(markdown).toContain("name: pen-document-agent");
    expect(markdown).toContain("`read_document`");
    expect(markdown).toContain("## How It Works");
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

  it("registers and retrieves skills", () => {
    const registry = new AISkillRegistry();
    const skill = createDocumentAgentSkill(tools);

    registry.register(skill);

    expect(registry.get(skill.name)).toEqual(skill);
    expect(registry.list()).toHaveLength(1);
  });
});
