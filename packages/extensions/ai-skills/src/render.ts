import type { AISkillDefinition, AISkillFile } from "./types";

function renderToolList(skill: AISkillDefinition): string {
  return skill.tools
    .map((tool) => `- \`${tool.name}\` - ${tool.description}`)
    .join("\n");
}

function renderInstructionList(skill: AISkillDefinition): string {
  return skill.instructions.map((instruction, index) => `${index + 1}. ${instruction}`).join("\n");
}

export function renderSkillMarkdown(skill: AISkillDefinition): string {
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.description}`,
    "---",
    "",
    `# ${skill.title}`,
    "",
    skill.description,
    "",
    "## How It Works",
    "",
    renderInstructionList(skill),
    "",
    "## Usage",
    "",
    skill.usage,
    "",
    "## Tools",
    "",
    renderToolList(skill),
    "",
    "## Present Results to User",
    "",
    "Summarize the document changes, list the most relevant tools you used, and flag any follow-up review the user should do.",
    "",
  ].join("\n");
}

export function renderSkillFiles(skill: AISkillDefinition): readonly AISkillFile[] {
  return [
    {
      path: `${skill.name}/SKILL.md`,
      content: renderSkillMarkdown(skill),
    },
    ...(skill.scripts ?? []).map((script) => ({
      path: `${skill.name}/${script.path}`,
      content: script.content,
    })),
    ...(skill.references ?? []).map((reference) => ({
      path: `${skill.name}/${reference.path}`,
      content: reference.content,
    })),
  ];
}
