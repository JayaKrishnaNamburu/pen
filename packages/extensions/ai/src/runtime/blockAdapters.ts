import type { AIWorkingSetEnvelope } from "../types";
import type {
	AIApplyStrategy,
	AIBlockAdapterId,
	AIBlockClass,
	AIContentFormat,
	AIMutationMode,
	AITargetKind,
	AITransportKind,
} from "./contracts";
import { buildFlowMarkdownRequestPrompt } from "./flowMarkdown";

export interface BlockAdapterBuildPromptInput {
	prompt: string;
	targetKind: AITargetKind;
	activeBlockId: string | null;
	workingSet: AIWorkingSetEnvelope | null;
	applyStrategy: AIApplyStrategy;
}

export interface BlockAdapter {
	id: AIBlockAdapterId;
	blockClass: AIBlockClass;
	targetKind: AITargetKind;
	contentFormat: AIContentFormat;
	transportKind: AITransportKind;
	buildPrompt(input: BlockAdapterBuildPromptInput): string;
}

const FLOW_BLOCK_ADAPTER: BlockAdapter = {
	id: "flow-markdown",
	blockClass: "flow",
	targetKind: "block",
	contentFormat: "markdown",
	transportKind: "flow-text",
	buildPrompt(input) {
		return buildFlowMarkdownRequestPrompt({
			prompt: input.prompt,
			workingSet: input.workingSet,
			applyStrategy: input.applyStrategy,
		});
	},
};

const BLOCK_ADAPTERS = [
	FLOW_BLOCK_ADAPTER,
] as const;

export interface ResolveBlockAdapterInput {
	targetKind: AITargetKind;
	target: "selection" | "block";
	activeBlockType?: string | null;
	surface?: "inline-edit" | "bottom-chat";
	mutationMode: AIMutationMode;
}

export function listBlockAdapters(): readonly BlockAdapter[] {
	return BLOCK_ADAPTERS;
}

export function getBlockAdapter(id: AIBlockAdapterId): BlockAdapter {
	return BLOCK_ADAPTERS.find((adapter) => adapter.id === id) ?? FLOW_BLOCK_ADAPTER;
}

export function resolveBlockAdapter(
	input: ResolveBlockAdapterInput,
): BlockAdapter {
	if (input.target === "selection") {
		return FLOW_BLOCK_ADAPTER;
	}
	if (input.targetKind === "table") {
		return FLOW_BLOCK_ADAPTER;
	}
	return FLOW_BLOCK_ADAPTER;
}

export function resolveBlockAdapterContentFormat(input: {
	adapter: BlockAdapter;
	target: "selection" | "block";
	targetKind: AITargetKind;
	surface?: "inline-edit" | "bottom-chat";
	mutationMode: AIMutationMode;
	fallback: AIContentFormat;
}): AIContentFormat {
	if (input.target === "selection") {
		return input.fallback;
	}
	if (input.adapter.id !== "flow-markdown") {
		return input.fallback;
	}
	if (
		input.targetKind === "table" ||
		input.fallback === "markdown" ||
		input.surface === "bottom-chat"
	) {
		return "markdown";
	}
	return input.fallback;
}
