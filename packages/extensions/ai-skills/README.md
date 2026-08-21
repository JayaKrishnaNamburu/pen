# `@input/pen-ai-skills`

`@input/pen-ai-skills` turns tool and autocomplete-provider descriptors into `SKILL.md` bundles (plus optional helper scripts and JSON references) for a host's agent product.

It is a packaging helper. It does not execute tools, load skills, talk to a model, or write files.

## Install

```bash
pnpm add @input/pen-ai-skills
```

## What a host implements

- Supply tool descriptors (`AIToolDescriptor` from `@input/pen-ai-tools`) and, if wanted, autocomplete provider descriptors (`AutocompleteProviderDescriptor` from `@input/pen-ai-autocomplete`). A live editor is optional; this package only consumes the descriptor arrays.
- Call `listDefaultAISkills` for the usual pair (document-agent always; autocomplete-context only when providers are supplied), or author an `AISkillDefinition`.
- Write or serve the `{ path, content }` list from `renderSkillFiles` (`SKILL.md`, helper scripts, JSON references).
- Load those files into the host's agent product. Pen has no skill loader.

## What Pen does not do

- No skill execution, confirmation, or tool grants — those live on `@input/pen-ai` / `@input/pen-ai-tools`.
- No filesystem, marketplace, or persistence for skill files. Bundled scripts are strings in memory; Pen never writes or runs them.
- No skill-copy i18n. Bundled instruction strings and the markdown template (section headings and the "Present Results to User" closer) are English packaging copy. There is no locale option, catalog, or translation of rendered artifacts. Authoring an `AISkillDefinition` replaces the skill's own fields only; it does not localize the template.
- No model provider, adapter, or hosted agent.
- No server-side policy, content filtering, or rate limiting of what the artifacts say.

## Public exports

| Export                                              | Role                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `listDefaultAISkills`                               | Builds the bundled document-agent skill, plus an autocomplete-context skill when provider descriptors are supplied. |
| `renderSkillFiles`                                  | Renders `SKILL.md` plus any scripts and references.                                                                 |
| `AISkillDefinition`, `AISkillFile`, `AISkillScript` | Artifact shapes.                                                                                                    |

## Usage

```ts
import { listDefaultAISkills, renderSkillFiles } from "@input/pen-ai-skills";
import type { AIToolDescriptor } from "@input/pen-ai-tools";
import type { AutocompleteProviderDescriptor } from "@input/pen-ai-autocomplete";

const tools: readonly AIToolDescriptor[] = [
  {
    name: "read_document",
    description: "Read document content.",
    inputSchema: { type: "object", properties: {} },
  },
];
const autocompleteProviders: readonly AutocompleteProviderDescriptor[] = [
  {
    id: "route-hint",
    description: "Adds the current route to autocomplete context.",
    kind: "consumer",
  },
];

const skills = listDefaultAISkills(tools, { autocompleteProviders });
const files = skills.flatMap((skill) => renderSkillFiles(skill));
```

`files` is an in-memory list (`pen-document-agent/SKILL.md`, `scripts/print-tools.sh`, `references/tools.json`, and the autocomplete counterparts when providers were supplied). The host writes or serves that list and loads it into its agent. This package does not do those steps.

Hosts that already have an editor can obtain descriptors from `@input/pen-ai-tools` (`listAITools`) and from the autocomplete controller's `listProviderDescriptors()`. That wiring is host-owned; it is not a skills-package API.

## Options

This package has no options. `listDefaultAISkills` always includes the document-agent skill and adds the autocomplete-context skill only when `autocompleteProviders` is supplied.

## Facets and commands

This package contributes no facets and no commands. It requires no other extensions. It reads descriptor arrays from `@input/pen-ai-tools` and `@input/pen-ai-autocomplete` when the host supplies them.

## Documentation

The docs site (the `@input/pen-docs` package) covers this area on the AI features page (`#/ai`).

The public signatures of record are in `api-report.md` next to this package's source in the Pen repository. The docs site does not host a generated browsable reference.

## License

MIT © Input B.V. See [`LICENSE.md`](./LICENSE.md).
