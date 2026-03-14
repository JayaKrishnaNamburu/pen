import type { AIWorkingSetEnvelope } from "../types";
import type {
	AIApplyStrategy,
	AIBlockAdapterId,
	AIBlockClass,
	AIContentFormat,
	AIMutationMode,
	AIPlannerMode,
	AITargetKind,
	AITransportKind,
} from "./contracts";
import { buildFlowMarkdownRequestPrompt } from "./flowMarkdown";
import {
	buildStructuredIntentRequestPrompt,
	type StructuredIntentParseResult,
	parseStructuredIntentPreview,
	parseStructuredIntentResult,
} from "./structuredIntent";
import {
	compileStructuredIntentToPlan,
	type StructuredIntentCompilationResult,
} from "./structuredIntentCompiler";

export interface BlockAdapterBuildPromptInput {
	prompt: string;
	targetKind: AITargetKind;
	activeBlockId: string | null;
	workingSet: AIWorkingSetEnvelope | null;
	applyStrategy: AIApplyStrategy;
}

export interface BlockAdapterResolveResultInput {
	value: unknown;
	targetKind: AITargetKind;
	activeBlockId: string | null;
}

export interface BlockAdapterResolvedPlan {
	parseResult: StructuredIntentParseResult;
	compilation: StructuredIntentCompilationResult | null;
}

export interface BlockAdapter {
	id: AIBlockAdapterId;
	blockClass: AIBlockClass;
	targetKind: AITargetKind;
	plannerMode: AIPlannerMode;
	contentFormat: AIContentFormat;
	transportKind: AITransportKind;
	buildPrompt(input: BlockAdapterBuildPromptInput): string;
	parsePreview?(input: BlockAdapterResolveResultInput): StructuredIntentParseResult | null;
	resolveResult?(input: BlockAdapterResolveResultInput): BlockAdapterResolvedPlan | null;
}

const FLOW_BLOCK_ADAPTER: BlockAdapter = {
	id: "flow-markdown",
	blockClass: "flow",
	targetKind: "block",
	plannerMode: "text",
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

const DATABASE_BLOCK_ADAPTER: BlockAdapter = {
	id: "database-app",
	blockClass: "app",
	targetKind: "database",
	plannerMode: "structured",
	contentFormat: "text",
	transportKind: "app-structured",
	buildPrompt(input) {
		return buildStructuredIntentRequestPrompt(input);
	},
	parsePreview(input) {
		return parseStructuredIntentPreview(input.value, input.targetKind);
	},
	resolveResult(input) {
		const parseResult = parseStructuredIntentResult(input.value, input.targetKind);
		const compilation = parseResult.intent
			? compileStructuredIntentToPlan(parseResult.intent, {
				activeBlockId: input.activeBlockId,
			})
			: null;
		return { parseResult, compilation };
	},
};

const BLOCK_ADAPTERS = [
	FLOW_BLOCK_ADAPTER,
	DATABASE_BLOCK_ADAPTER,
] as const;

export interface ResolveBlockAdapterInput {
	targetKind: AITargetKind;
	plannerMode: AIPlannerMode;
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
	if (input.targetKind === "database") {
		return DATABASE_BLOCK_ADAPTER;
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
